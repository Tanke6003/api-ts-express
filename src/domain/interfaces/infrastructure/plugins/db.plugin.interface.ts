// src/domain/interfaces/infrastructure/plugins/db.plugin.interface.ts
import type { ISqlExecutor } from "./sql-executor.interface";

/** Motores soportados. Es también el valor que acepta `DATA_SOURCE`. */
export type DbEngine = "memory" | "oracle" | "mssql" | "postgres" | "mysql" | "mongodb";

/**
 * Contrato común a **todos** los conectores, sean SQL o documentales.
 *
 * Sólo cubre el ciclo de vida de la conexión, que es lo único que de verdad
 * comparten: abrir, comprobar y cerrar. Es lo que necesita el arranque de la
 * aplicación, y por eso `main.ts` no sabe contra qué motor está corriendo.
 *
 * La uniformidad de cara a los servicios no vive aquí sino un piso más arriba,
 * en `IGenericRepository<T>`: ahí sí todos los motores se usan exactamente
 * igual. Intentar unificar más abajo obligaría a fingir que a MongoDB se le
 * pueden mandar sentencias SQL.
 */
export interface IDbPlugin {
  /** Identifica al motor en logs y diagnósticos. */
  readonly engine: DbEngine;

  /** Abre la conexión si hace falta y comprueba que la base responde. */
  authenticate(): Promise<void>;

  /** Libera el pool o el cliente. */
  close(): Promise<void>;
}

/**
 * Conector de un motor SQL. Añade al ciclo de vida lo que consume el
 * repositorio genérico: ejecutar sentencias y abrir transacciones.
 *
 * Lo implementan Oracle, SQL Server, PostgreSQL y MySQL/MariaDB, y por eso los
 * cuatro comparten un único `SqlGenericRepository`: lo que cambia entre ellos
 * está en el `SqlDialect`, no en el conector.
 */
export interface ISqlDbPlugin extends IDbPlugin, ISqlExecutor {
  /** Ejecuta `work` en una transacción; commit al terminar, rollback si lanza. */
  transaction<T>(work: (tx: ISqlExecutor) => Promise<T>): Promise<T>;
}
