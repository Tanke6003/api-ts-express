// src/infrastructure/plugins/isequelize.plugin.ts
export interface ISqlConnectionPlugin {
  /**
   * Equivalente a GetDataTable: devuelve un array de registros tipados.
   */
  getDataTable<TRow = Record<string, unknown>>(
    query: string,
    replacements?: unknown[]
  ): Promise<TRow[]>;

  /**
   * Ejecuta query (con o sin parámetros), retorna las filas y la metadata.
   */
  executeQuery<TRow = unknown, TMeta = unknown>(
    query: string,
    replacements?: unknown[],
    options?: Record<string, unknown>
  ): Promise<{ rows: TRow; metadata: TMeta }>;

  /**
   * Ejecutar procedimiento almacenado con parámetros
   */
  execStoredProcedure<TRow = Record<string, unknown>>(
    spName: string,
    params?: unknown[]
  ): Promise<TRow[]>;

  /**
   * Ejecutar un bloque dentro de una transacción
   */
  transaction<T>(work: (t: unknown) => Promise<T>): Promise<T>;

  /**
   * Bulk insert con Sequelize
   */
  bulkInsert(table: string, records: object[]): Promise<void>;
}
