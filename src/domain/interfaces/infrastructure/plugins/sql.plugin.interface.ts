// src/infrastructure/plugins/isequelize.plugin.ts
export interface ISqlConnectionPlugin {
  /**
   * Equivalente a GetDataTable: devuelve un array de registros
   */
  getDataTable(query: string, replacements?: any[]): Promise<any[]>;

  /**
   * Ejecuta query (con o sin parámetros), retorna resultado crudo
   */
  executeQuery(
    query: string,
    replacements?: any[],
    options?: any
  ): Promise<{ rows: any; metadata: any }>;

  /**
   * Ejecutar procedimiento almacenado con parámetros
   */
  execStoredProcedure(spName: string, params?: any[]): Promise<any[]>;

  /**
   * Ejecutar un bloque dentro de una transacción
   */
  transaction<T>(work: (t: any) => Promise<T>): Promise<T>;

  /**
   * Bulk insert con Sequelize
   */
  bulkInsert(table: string, records: object[]): Promise<void>;
}
