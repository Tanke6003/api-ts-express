// src/domain/interfaces/infrastructure/plugins/oracle.plugin.interface.ts
import { ISqlConnectionPlugin } from "./sql.plugin.interface";
import { ISqlExecutor, SqlExecuteResult } from "./sql-executor.interface";

/**
 * Un bind de Oracle: o el valor directo, o un descriptor para parámetros de
 * salida (`RETURNING ... INTO`). Se modela aquí para no arrastrar los tipos de
 * `oracledb` hasta el dominio.
 */
export interface OracleOutBind {
  dir: number;
  type?: number;
  maxSize?: number;
}

export type OracleBindValue = unknown | OracleOutBind;
export type OracleBinds = Record<string, OracleBindValue> | unknown[];

/** Oracle devuelve filas, filas afectadas y binds de salida en una respuesta. */
export type OracleExecuteResult<TRow = Record<string, unknown>> = SqlExecuteResult<TRow>;

/**
 * Ejecuta sentencias dentro de una transacción abierta. El commit/rollback lo
 * maneja `transaction()`, no quien recibe este contexto.
 */
export type IOracleTransaction = ISqlExecutor;

/** Alias histórico: el contrato es el genérico de SQL. */
export type IOracleExecutor = ISqlExecutor;

/**
 * Conexión a Oracle sobre `node-oracledb` en modo *thin* (no requiere instalar
 * Oracle Instant Client). Extiende el contrato SQL genérico del proyecto para
 * poder convivir con `SequelizePlugin` en el contenedor de DI.
 */
export interface IOracleConnectionPlugin extends ISqlConnectionPlugin, ISqlExecutor {
  /** Abre el pool si hace falta y verifica que la base responde. */
  authenticate(): Promise<void>;

  /** Ejecuta `work` en una transacción; commit al terminar, rollback si lanza. */
  transaction<T>(work: (tx: IOracleTransaction) => Promise<T>): Promise<T>;

  /** Cierra el pool. */
  close(): Promise<void>;
}
