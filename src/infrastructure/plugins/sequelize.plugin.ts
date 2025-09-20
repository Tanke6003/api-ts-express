// src/infrastructure/plugins/sequelize.connection.ts
import { Sequelize, QueryTypes, Transaction, Options } from "sequelize";
import { ISqlConnectionPlugin } from "../../domain/interfaces/infrastructure/plugins/sql.plugin.interface";

export interface SequelizeConnectionConfig {
  dialect: "mssql" | "mysql" | "mariadb" | "postgres";
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

export class SequelizePlugin implements ISqlConnectionPlugin {
  private connection: Sequelize;

  constructor(config: SequelizeConnectionConfig) {
    this.connection = new Sequelize({
      ...config,
      pool: { max: 10, min: 0, idle: 10000 },
      logging: process.env.NODE_ENV != "production" ? console.log : false,
    } as Options);
  }

  /**
   * Probar conexión a la base de datos
   */
  async authenticate(): Promise<void> {
    try {
      await this.connection.authenticate();
      console.log("✅ Database connection established successfully.");
    } catch (error) {
      console.error("❌ Unable to connect to the database:", error);
      throw new Error("Database connection failed.");
    }
  }

  /**
   * Equivalente a GetDataTable: devuelve un array de registros
   */
  async getDataTable(query: string, replacements: any[] = []): Promise<any[]> {
    return await this.connection.query(query, {
      replacements,
      type: QueryTypes.SELECT,
    });
  }

  /**
   * Ejecuta query (con o sin parámetros), retorna resultado crudo
   */
  async executeQuery(
    query: string,
    replacements: any[] = [],
    options: any = {}
  ): Promise<any> {
  // separar el resultado y las filas afectadas
   const [rowsOrResult,metadata] = await this.connection.query(query, { replacements, ...options });



  // UPDATE/DELETE/INSERT → objeto con affectedRows
  return {
    rows: rowsOrResult,
    metadata: metadata
  };  
  }

  /**
   * Ejecutar procedimiento almacenado con parámetros (multi-dialecto)
   */
  async execStoredProcedure(
    spName: string,
    params: any[] = []
  ): Promise<any[]> {
    const placeholders = params.map(() => "?").join(", ");

    let sql: string;
    switch (this.connection.getDialect()) {
      case "mssql":
        sql = `EXEC ${spName} ${placeholders}`;
        break;
      case "mysql":
      case "mariadb":
      case "postgres": // en postgres depende si es FUNCTION o PROCEDURE
        sql = `CALL ${spName}(${placeholders})`;
        break;
      default:
        throw new Error(
          `Dialect ${this.connection.getDialect()} not supported for stored procedures`
        );
    }

    return await this.connection.query(sql, {
      replacements: params,
      type: QueryTypes.SELECT,
    });
  }

  /**
   * Ejecutar un bloque dentro de una transacción
   */
  async transaction<T>(work: (t: Transaction) => Promise<T>): Promise<T> {
    const t = await this.connection.transaction();
    try {
      const result = await work(t);
      await t.commit();
      return result;
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  /**
   * Bulk insert con Sequelize
   * Recibe nombre de tabla y arreglo de objetos
   */
  async bulkInsert(table: string, records: object[]): Promise<void> {
    if (!records.length) return;

    const keys = Object.keys(records[0]);
    const columns = keys.join(", ");
    const placeholders = `(${keys.map(() => "?").join(", ")})`;
    const values = records.flatMap(Object.values);

    const sql = `
      INSERT INTO ${table} (${columns})
      VALUES ${records.map(() => placeholders).join(", ")}
    `;

    await this.connection.query(sql, { replacements: values });
    console.log(`✅ Bulk insert: ${records.length} rows inserted into ${table}`);
  }

  /**
   * Cierra la conexión
   */
  async close(): Promise<void> {
    await this.connection.close();
    console.log("🔒 Database connection closed.");
  }
}
