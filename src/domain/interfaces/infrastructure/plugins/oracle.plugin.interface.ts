// src/domain/interfaces/infrastructure/plugins/oracle.plugin.interface.ts
import { ISqlConnectionPlugin } from "./sql.plugin.interface";

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

export interface OracleExecuteResult<TRow = Record<string, unknown>> {
  rows: TRow[];
  rowsAffected: number;
  /** Valores devueltos por los binds de salida, indexados por nombre. */
  outBinds: Record<string, unknown[]>;
}

/**
 * Lo mínimo que necesita el repositorio genérico para hablar con Oracle.
 *
 * Lo implementan tanto el pool (cada sentencia con auto-commit) como el contexto
 * de una transacción (sin auto-commit). Gracias a eso, el mismo repositorio
 * funciona suelto o dentro de una transacción sin cambiar una línea.
 */
export interface IOracleExecutor {
  execute<TRow = Record<string, unknown>>(
    sql: string,
    binds?: OracleBinds
  ): Promise<OracleExecuteResult<TRow>>;

  /** Ejecuta la misma sentencia con muchos juegos de binds (bulk). */
  executeMany(sql: string, binds: Record<string, unknown>[]): Promise<number>;
}

/**
 * Ejecuta sentencias dentro de una transacción abierta. El commit/rollback lo
 * maneja `transaction()`, no quien recibe este contexto.
 */
export type IOracleTransaction = IOracleExecutor;

/**
 * Conexión a Oracle sobre `node-oracledb` en modo *thin* (no requiere instalar
 * Oracle Instant Client). Extiende el contrato SQL genérico del proyecto para
 * poder convivir con `SequelizePlugin` en el contenedor de DI.
 */
export interface IOracleConnectionPlugin extends ISqlConnectionPlugin, IOracleExecutor {
  /** Abre el pool si hace falta y verifica que la base responde. */
  authenticate(): Promise<void>;

  /** Ejecuta `work` en una transacción; commit al terminar, rollback si lanza. */
  transaction<T>(work: (tx: IOracleTransaction) => Promise<T>): Promise<T>;

  /** Cierra el pool. */
  close(): Promise<void>;
}
