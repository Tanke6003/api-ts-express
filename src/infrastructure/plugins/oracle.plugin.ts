// src/infrastructure/plugins/oracle.plugin.ts
import oracledb from "oracledb";
import type {
  IOracleConnectionPlugin,
  IOracleTransaction,
  OracleBinds,
  OracleExecuteResult,
} from "../../domain/interfaces/infrastructure/plugins/oracle.plugin.interface";
import type { ILogger } from "../../domain/interfaces/infrastructure/plugins/logger.plugin.interface";

export interface OracleConnectionConfig {
  user: string;
  password: string;
  /** Easy Connect: `host:puerto/servicio`, p.ej. `localhost:1521/FREEPDB1`. */
  connectString: string;
  poolMin?: number;
  poolMax?: number;
  poolIncrement?: number;
}

// Devolver objetos (`{ PK_USER: 1 }`) en vez de arrays posicionales es lo que
// permite al repositorio genérico mapear columna -> propiedad sin conocer el
// orden del SELECT. Es configuración global del driver, se fija una sola vez.
oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
// Los LOB llegan como string en lugar de como stream: simplifica el mapeo y
// nuestras columnas de texto son pequeñas.
oracledb.fetchAsString = [oracledb.CLOB];

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Conexión a Oracle sobre `node-oracledb` en modo *thin*: habla el protocolo
 * nativo desde Node, así que no hace falta instalar Oracle Instant Client.
 *
 * Expone lo que consume el repositorio genérico (`ISqlExecutor`), la gestión
 * del pool y los procedimientos almacenados. Lo que el API genérica ya cubre
 * —proyecciones, inserción masiva— no se duplica aquí.
 *
 * El pool se crea de forma perezosa y memoizada: la primera operación que llegue
 * lo abre y el resto espera esa misma promesa, de modo que un arranque con varias
 * peticiones en paralelo no crea pools duplicados.
 */
export class OraclePlugin implements IOracleConnectionPlugin {
  private pool: oracledb.Pool | null = null;
  private pending: Promise<oracledb.Pool> | null = null;
  private closed = false;

  constructor(
    private readonly config: OracleConnectionConfig,
    private readonly logger: ILogger
  ) {}

  // ---------------------------------------------------------------- pool ----

  private async getPool(): Promise<oracledb.Pool> {
    if (this.pool) return this.pool;
    if (this.closed) throw new Error("[OraclePlugin] El pool ya fue cerrado.");

    if (!this.pending) {
      this.pending = oracledb
        .createPool({
          user: this.config.user,
          password: this.config.password,
          connectString: this.config.connectString,
          poolMin: this.config.poolMin ?? 1,
          poolMax: this.config.poolMax ?? 10,
          poolIncrement: this.config.poolIncrement ?? 1,
        })
        .then((pool) => {
          this.pool = pool;
          this.logger.info("Oracle pool creado", {
            connectString: this.config.connectString,
            user: this.config.user,
          });
          return pool;
        })
        .catch((err) => {
          // Sin esto, un fallo transitorio (la base todavía arrancando) dejaría
          // la promesa rechazada cacheada para siempre.
          this.pending = null;
          this.logger.error("No se pudo crear el pool de Oracle", { err: toMessage(err) });
          throw new Error(`[OraclePlugin] createPool failed: ${toMessage(err)}`, { cause: err });
        });
    }

    return this.pending;
  }

  async authenticate(): Promise<void> {
    const pool = await this.getPool();
    const connection = await pool.getConnection();
    try {
      await connection.execute("SELECT 1 FROM DUAL");
      this.logger.info("Conexión con Oracle establecida correctamente.");
    } catch (err) {
      this.logger.error("No fue posible conectar con Oracle", { err: toMessage(err) });
      throw new Error(`[OraclePlugin] authenticate failed: ${toMessage(err)}`, { cause: err });
    } finally {
      await connection.close();
    }
  }

  // ----------------------------------------------------------- ejecución ----

  // El tercer parámetro forma parte del contrato `ISqlExecutor` pero Oracle no
  // lo necesita: devuelve filas y filas afectadas en la misma respuesta.
  async execute<TRow = Record<string, unknown>>(
    sql: string,
    binds: OracleBinds = {}
  ): Promise<OracleExecuteResult<TRow>> {
    const pool = await this.getPool();
    const connection = await pool.getConnection();
    try {
      const result = await connection.execute(
        sql,
        binds as oracledb.BindParameters,
        { autoCommit: true }
      );
      this.logger.debug("Oracle execute", { sql });
      return {
        rows: (result.rows ?? []) as TRow[],
        rowsAffected: result.rowsAffected ?? 0,
        outBinds: (result.outBinds ?? {}) as Record<string, unknown[]>,
      };
    } catch (err) {
      this.logger.error("Error ejecutando sentencia en Oracle", { sql, err: toMessage(err) });
      throw new Error(`[OraclePlugin] execute failed: ${toMessage(err)}`, { cause: err });
    } finally {
      await connection.close();
    }
  }

  async executeMany(sql: string, binds: Record<string, unknown>[]): Promise<number> {
    if (binds.length === 0) return 0;

    const pool = await this.getPool();
    const connection = await pool.getConnection();
    try {
      const result = await connection.executeMany(
        sql,
        binds as oracledb.BindParameters[],
        { autoCommit: true }
      );
      this.logger.debug("Oracle executeMany", { sql, batch: binds.length });
      return result.rowsAffected ?? 0;
    } catch (err) {
      this.logger.error("Error en executeMany", { sql, err: toMessage(err) });
      throw new Error(`[OraclePlugin] executeMany failed: ${toMessage(err)}`, { cause: err });
    } finally {
      await connection.close();
    }
  }

  /**
   * Llama a un procedimiento almacenado y devuelve el contenido de su cursor de
   * salida.
   *
   * Convención: el procedimiento debe declarar como último parámetro un
   * `OUT SYS_REFCURSOR`. Es la única forma de que un SP de Oracle devuelva un
   * conjunto de filas, y así el método puede tener la misma firma que el resto
   * de drivers del proyecto.
   */
  async execStoredProcedure<TRow = Record<string, unknown>>(
    spName: string,
    params: unknown[] = []
  ): Promise<TRow[]> {
    const binds: Record<string, unknown> = {};
    params.forEach((value, i) => {
      binds[`p${i}`] = value;
    });
    binds.cursor = { dir: oracledb.BIND_OUT, type: oracledb.CURSOR };

    const placeholders = params.map((_, i) => `:p${i}`).concat(":cursor").join(", ");
    const sql = `BEGIN ${spName}(${placeholders}); END;`;

    const pool = await this.getPool();
    const connection = await pool.getConnection();
    try {
      const result = await connection.execute(sql, binds as oracledb.BindParameters);
      const outBinds = result.outBinds as { cursor?: oracledb.ResultSet<TRow> } | undefined;
      const resultSet = outBinds?.cursor;
      if (!resultSet) return [];

      const rows = await resultSet.getRows();
      await resultSet.close();
      return rows as TRow[];
    } catch (err) {
      this.logger.error("Error ejecutando procedimiento almacenado", {
        spName,
        err: toMessage(err),
      });
      throw new Error(`[OraclePlugin] execStoredProcedure ${spName} failed: ${toMessage(err)}`, {
        cause: err,
      });
    } finally {
      await connection.close();
    }
  }

  /**
   * Ejecuta `work` con una única conexión y sin auto-commit: si termina bien se
   * hace commit, si lanza se hace rollback.
   */
  async transaction<T>(work: (tx: IOracleTransaction) => Promise<T>): Promise<T> {
    const pool = await this.getPool();
    const connection = await pool.getConnection();

    // Mismo contrato que el pool pero sin auto-commit, para que el repositorio
    // genérico pueda ejecutarse dentro de la transacción sin saberlo.
    const tx: IOracleTransaction = {
      execute: async <TRow = Record<string, unknown>>(sql: string, binds: OracleBinds = {}) => {
        const result = await connection.execute(sql, binds as oracledb.BindParameters, {
          autoCommit: false,
        });
        return {
          rows: (result.rows ?? []) as TRow[],
          rowsAffected: result.rowsAffected ?? 0,
          outBinds: (result.outBinds ?? {}) as Record<string, unknown[]>,
        };
      },
      executeMany: async (sql: string, binds: Record<string, unknown>[]) => {
        if (binds.length === 0) return 0;
        const result = await connection.executeMany(
          sql,
          binds as oracledb.BindParameters[],
          { autoCommit: false }
        );
        return result.rowsAffected ?? 0;
      },
    };

    try {
      const result = await work(tx);
      await connection.commit();
      return result;
    } catch (err) {
      await connection.rollback();
      this.logger.error("Transacción revertida", { err: toMessage(err) });
      throw err;
    } finally {
      await connection.close();
    }
  }

  async close(): Promise<void> {
    if (!this.pool) return;
    // El drenaje de 10 s deja que terminen las consultas en vuelo en vez de
    // cortarlas de golpe.
    await this.pool.close(10);
    this.pool = null;
    this.pending = null;
    this.closed = true;
    this.logger.info("Pool de Oracle cerrado.");
  }
}
