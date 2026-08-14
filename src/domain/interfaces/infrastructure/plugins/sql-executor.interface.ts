// src/domain/interfaces/infrastructure/plugins/sql-executor.interface.ts

export interface SqlExecuteResult<TRow = Record<string, unknown>> {
  rows: TRow[];
  rowsAffected: number;
  /** Valores de los parámetros de salida, indexados por nombre (Oracle). */
  outBinds: Record<string, unknown[]>;
}

export interface SqlExecuteOptions {
  /**
   * Qué se espera de la sentencia.
   *
   * Oracle devuelve filas y filas afectadas en la misma respuesta y lo ignora,
   * pero el resto necesita saberlo para elegir cómo ejecutar: leer un conjunto
   * de resultados, pedir `@@ROWCOUNT` o recoger el id generado no son la misma
   * llamada. Con `identity` el executor devuelve el id en
   * `rows[0].insertedId`, que es donde lo busca el dialecto.
   */
  expects?: "rows" | "affected" | "identity";
}

/**
 * Lo mínimo que necesita el repositorio genérico para hablar con un motor SQL.
 *
 * Lo implementan tanto el pool (cada sentencia con auto-commit) como el
 * contexto de una transacción, y tanto Oracle como SQL Server. Gracias a eso el
 * mismo repositorio sirve para los dos motores, dentro o fuera de transacción.
 *
 * Los binds son siempre nombrados (`:nombre`), que es la sintaxis que aceptan
 * node-oracledb y los `replacements` de Sequelize.
 */
export interface ISqlExecutor {
  execute<TRow = Record<string, unknown>>(
    sql: string,
    binds?: Record<string, unknown>,
    options?: SqlExecuteOptions
  ): Promise<SqlExecuteResult<TRow>>;

  /** Ejecuta la misma sentencia con muchos juegos de binds (bulk). */
  executeMany(sql: string, binds: Record<string, unknown>[]): Promise<number>;
}
