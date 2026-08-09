// src/infrastructure/plugins/sqlserver.plugin.ts
import { Options, QueryTypes, Sequelize, Transaction } from "sequelize";
import type {
  ISqlExecutor,
  SqlExecuteOptions,
  SqlExecuteResult,
} from "../../domain/interfaces/infrastructure/plugins/sql-executor.interface";
import type { ILogger } from "../../domain/interfaces/infrastructure/plugins/logger.plugin.interface";
import type { ISqlTransactionRunner } from "../repositories/base/sql.unit-of-work";

export interface SqlServerConnectionConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

/** Alias de la columna con la que SQL Server informa las filas afectadas. */
const AFFECTED_ROWS = "AFFECTEDROWS";

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Conexión a SQL Server para el repositorio genérico, sobre Sequelize + tedious.
 *
 * Existe aparte de `SequelizePlugin` porque el repositorio genérico necesita dos
 * cosas que aquél no ofrece: binds **nombrados** (`:b0`) y un número fiable de
 * filas afectadas.
 *
 * Lo segundo es la diferencia real con Oracle. `node-oracledb` devuelve
 * `rowsAffected` en la propia respuesta; SQL Server no, así que a las sentencias
 * de escritura se les añade `SELECT @@ROWCOUNT` y se leen como un SELECT. Por
 * eso `ISqlExecutor.execute` recibe `expects`: es el repositorio quien sabe si
 * la sentencia devuelve filas o cuenta filas.
 *
 * Nota sobre los binds: los `replacements` de Sequelize se escapan e
 * interpolan, no son parámetros de servidor. El escape lo hace Sequelize según
 * el dialecto, así que es seguro frente a inyección, pero no reutiliza planes
 * de ejecución como sí haría un bind real.
 */
export class SqlServerPlugin implements ISqlExecutor, ISqlTransactionRunner {
  private readonly connection: Sequelize;

  constructor(
    config: SqlServerConnectionConfig,
    private readonly logger: ILogger
  ) {
    this.connection = new Sequelize({
      dialect: "mssql",
      host: config.host,
      port: config.port,
      username: config.username,
      password: config.password,
      database: config.database,
      pool: { max: 10, min: 0, idle: 10000 },
      logging:
        process.env.NODE_ENV !== "production"
          ? (sql: string) => this.logger.debug(sql)
          : false,
    } as Options);
  }

  async authenticate(): Promise<void> {
    try {
      await this.connection.authenticate();
      this.logger.info("Conexión con SQL Server establecida correctamente.");
    } catch (err) {
      this.logger.error("No fue posible conectar con SQL Server", { err: toMessage(err) });
      throw new Error(`[SqlServerPlugin] authenticate failed: ${toMessage(err)}`, { cause: err });
    }
  }

  // ----------------------------------------------------------- ejecución ----

  private async run<TRow>(
    sql: string,
    binds: Record<string, unknown>,
    options: SqlExecuteOptions,
    transaction?: Transaction
  ): Promise<SqlExecuteResult<TRow>> {
    try {
      if ((options.expects ?? "rows") === "rows") {
        const rows = (await this.connection.query(sql, {
          replacements: binds,
          type: QueryTypes.SELECT,
          transaction,
        })) as TRow[];

        return { rows, rowsAffected: rows.length, outBinds: {} };
      }

      // @@ROWCOUNT refleja la última sentencia del lote, que es la escritura.
      const rows = (await this.connection.query(
        `${sql}; SELECT @@ROWCOUNT AS ${AFFECTED_ROWS};`,
        { replacements: binds, type: QueryTypes.SELECT, transaction }
      )) as Record<string, unknown>[];

      const affected = rows.at(-1)?.[AFFECTED_ROWS];
      return { rows: [], rowsAffected: Number(affected ?? 0), outBinds: {} };
    } catch (err) {
      this.logger.error("Error ejecutando sentencia en SQL Server", { sql, err: toMessage(err) });
      throw new Error(`[SqlServerPlugin] execute failed: ${toMessage(err)}`, { cause: err });
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
      const result = await this.run(sql, row, { expects: "affected" }, transaction);
      affected += result.rowsAffected;
    }
    return affected;
  }

  async executeMany(sql: string, binds: Record<string, unknown>[]): Promise<number> {
    if (binds.length === 0) return 0;

    const affected = await this.connection.transaction((t) => this.runMany(sql, binds, t));
    this.logger.debug("SQL Server executeMany", { sql, batch: binds.length, affected });
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
    this.logger.info("Conexión con SQL Server cerrada.");
  }
}
