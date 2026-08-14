// src/infrastructure/plugins/sequelize-db.plugin.ts
import { Options, QueryTypes, Sequelize, Transaction } from "sequelize";
import type {
  ISqlExecutor,
  SqlExecuteOptions,
  SqlExecuteResult,
} from "../../domain/interfaces/infrastructure/plugins/sql-executor.interface";
import type {
  DbEngine,
  ISqlDbPlugin,
} from "../../domain/interfaces/infrastructure/plugins/db.plugin.interface";
import type { ILogger } from "../../domain/interfaces/infrastructure/plugins/logger.plugin.interface";

/** Motores que cubre este conector; los tres los habla Sequelize. */
export type SequelizeEngine = Extract<DbEngine, "mssql" | "postgres" | "mysql">;

export interface SequelizeConnectionConfig {
  engine: SequelizeEngine;
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  poolMin?: number;
  poolMax?: number;
}

/** Alias del motor tal y como lo nombra Sequelize. */
const SEQUELIZE_DIALECT: Record<SequelizeEngine, "mssql" | "postgres" | "mysql"> = {
  mssql: "mssql",
  postgres: "postgres",
  mysql: "mysql",
};

/** Alias de la columna con la que SQL Server informa las filas afectadas. */
const AFFECTED_ROWS = "AFFECTEDROWS";
/** Alias con el que el dialecto espera encontrar la PK generada. */
const INSERTED_ID = "insertedId";

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Conector para los motores SQL que habla Sequelize: SQL Server, PostgreSQL y
 * MySQL/MariaDB.
 *
 * Es uno solo para los tres porque lo que cambia entre ellos —cómo se recupera
 * una PK generada, la expresión de fecha, la paginación— vive en el
 * `SqlDialect`, no aquí. Lo único que este conector resuelve por motor es cómo
 * pedirle al driver dos datos que no todos devuelven igual: las filas afectadas
 * y el id generado.
 *
 * Nota sobre los binds: los `replacements` de Sequelize se escapan e
 * interpolan, no son parámetros de servidor. El escape lo hace Sequelize según
 * el dialecto, así que es seguro frente a inyección, pero no reutiliza planes
 * de ejecución como sí haría un bind real.
 */
export class SequelizeDbPlugin implements ISqlDbPlugin {
  readonly engine: DbEngine;
  private readonly connection: Sequelize;

  constructor(
    private readonly config: SequelizeConnectionConfig,
    private readonly logger: ILogger
  ) {
    this.engine = config.engine;
    this.connection = new Sequelize({
      dialect: SEQUELIZE_DIALECT[config.engine],
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
      database: config.database,
      pool: { max: config.poolMax ?? 10, min: config.poolMin ?? 0, idle: 10000 },
      logging:
        process.env.NODE_ENV !== "production"
          ? (sql: string) => this.logger.debug(sql)
          : false,
    } as Options);
  }

  async authenticate(): Promise<void> {
    try {
      await this.connection.authenticate();
      this.logger.info(`Conexión con ${this.engine} establecida correctamente.`);
    } catch (err) {
      this.logger.error(`No fue posible conectar con ${this.engine}`, { err: toMessage(err) });
      throw new Error(`[SequelizeDbPlugin:${this.engine}] authenticate failed: ${toMessage(err)}`, {
        cause: err,
      });
    }
  }

  // ----------------------------------------------------------- ejecución ----

  /**
   * Filas afectadas.
   *
   * SQL Server no las reporta en la respuesta, así que se le añade
   * `SELECT @@ROWCOUNT` y se lee como un conjunto de resultados. PostgreSQL y
   * MySQL sí las devuelven, y Sequelize las expone con `QueryTypes.BULKUPDATE`.
   */
  private async runAffected(
    sql: string,
    binds: Record<string, unknown>,
    transaction?: Transaction
  ): Promise<number> {
    if (this.engine === "mssql") {
      // @@ROWCOUNT refleja la última sentencia del lote, que es la escritura.
      const rows = (await this.connection.query(
        `${sql}; SELECT @@ROWCOUNT AS ${AFFECTED_ROWS};`,
        { replacements: binds, type: QueryTypes.SELECT, transaction }
      )) as Record<string, unknown>[];

      return Number(rows.at(-1)?.[AFFECTED_ROWS] ?? 0);
    }

    const affected = (await this.connection.query(sql, {
      replacements: binds,
      type: QueryTypes.BULKUPDATE,
      transaction,
    })) as unknown as number;

    return Number(affected ?? 0);
  }

  /** Id generado por el motor, para los que no tienen RETURNING ni OUTPUT. */
  private async runIdentity(
    sql: string,
    binds: Record<string, unknown>,
    transaction?: Transaction
  ): Promise<SqlExecuteResult<never>> {
    // `QueryTypes.INSERT` devuelve [id, filas]; es como Sequelize expone
    // LAST_INSERT_ID() sin tener que emitir una segunda sentencia, que en un
    // pool podría acabar en otra conexión y devolver el id equivocado.
    const [insertedId, affected] = (await this.connection.query(sql, {
      replacements: binds,
      type: QueryTypes.INSERT,
      transaction,
    })) as unknown as [number, number];

    return {
      rows: [{ [INSERTED_ID]: insertedId }] as never[],
      rowsAffected: Number(affected ?? 1),
      outBinds: {},
    };
  }

  private async run<TRow>(
    sql: string,
    binds: Record<string, unknown>,
    options: SqlExecuteOptions,
    transaction?: Transaction
  ): Promise<SqlExecuteResult<TRow>> {
    try {
      const expects = options.expects ?? "rows";

      if (expects === "rows") {
        const rows = (await this.connection.query(sql, {
          replacements: binds,
          type: QueryTypes.SELECT,
          transaction,
        })) as TRow[];

        return { rows, rowsAffected: rows.length, outBinds: {} };
      }

      if (expects === "identity") {
        return (await this.runIdentity(sql, binds, transaction)) as SqlExecuteResult<TRow>;
      }

      return {
        rows: [],
        rowsAffected: await this.runAffected(sql, binds, transaction),
        outBinds: {},
      };
    } catch (err) {
      this.logger.error(`Error ejecutando sentencia en ${this.engine}`, {
        sql,
        err: toMessage(err),
      });
      throw new Error(`[SequelizeDbPlugin:${this.engine}] execute failed: ${toMessage(err)}`, {
        cause: err,
      });
    }
  }

  execute<TRow = Record<string, unknown>>(
    sql: string,
    binds: Record<string, unknown> = {},
    options: SqlExecuteOptions = {}
  ): Promise<SqlExecuteResult<TRow>> {
    return this.run<TRow>(sql, binds, options, undefined);
  }

  /**
   * Sequelize no tiene un `executeMany` como el de node-oracledb, así que se
   * repite la sentencia dentro de una transacción: o entran todas las filas o
   * no entra ninguna, que es la garantía que da el bulk de Oracle.
   */
  private async runMany(
    sql: string,
    binds: Record<string, unknown>[],
    transaction: Transaction
  ): Promise<number> {
    let affected = 0;
    for (const row of binds) {
      affected += await this.runAffected(sql, row, transaction);
    }
    return affected;
  }

  async executeMany(sql: string, binds: Record<string, unknown>[]): Promise<number> {
    if (binds.length === 0) return 0;

    const affected = await this.connection.transaction((t) => this.runMany(sql, binds, t));
    this.logger.debug(`${this.engine} executeMany`, { sql, batch: binds.length, affected });
    return affected;
  }

  /**
   * Transacción gestionada por Sequelize: commit al resolver, rollback al
   * lanzar. El bloque recibe un executor atado a ella.
   */
  transaction<T>(work: (tx: ISqlExecutor) => Promise<T>): Promise<T> {
    return this.connection.transaction(async (t) => {
      const tx: ISqlExecutor = {
        execute: <TRow = Record<string, unknown>>(
          sql: string,
          binds: Record<string, unknown> = {},
          options: SqlExecuteOptions = {}
        ) => this.run<TRow>(sql, binds, options, t),
        executeMany: (sql: string, binds: Record<string, unknown>[]) =>
          binds.length === 0 ? Promise.resolve(0) : this.runMany(sql, binds, t),
      };

      return work(tx);
    });
  }

  async close(): Promise<void> {
    await this.connection.close();
    this.logger.info(`Conexión con ${this.engine} cerrada.`);
  }
}
