// src/domain/interfaces/infrastructure/plugins/oracle.plugin.interface.ts
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
 * Oracle Instant Client).
 *
 * Su contrato es el genérico `ISqlExecutor` —lo que consume el repositorio
 * genérico— más lo propio de gestionar la conexión. Sólo añade un método fuera
 * de ese guion: los procedimientos almacenados, que no tienen equivalente en el
 * API genérica.
 */
export interface IOracleConnectionPlugin extends ISqlExecutor {
  /** Abre el pool si hace falta y verifica que la base responde. */
  authenticate(): Promise<void>;

  /** Ejecuta `work` en una transacción; commit al terminar, rollback si lanza. */
  transaction<T>(work: (tx: IOracleTransaction) => Promise<T>): Promise<T>;

  /**
   * Llama a un procedimiento almacenado y devuelve el contenido de su cursor de
   * salida. Convención: el último parámetro debe ser un `OUT SYS_REFCURSOR`,
   * que es la única forma de que un SP de Oracle devuelva filas.
   */
  execStoredProcedure<TRow = Record<string, unknown>>(
    spName: string,
    params?: unknown[]
  ): Promise<TRow[]>;

  /** Cierra el pool. */
  close(): Promise<void>;
}
