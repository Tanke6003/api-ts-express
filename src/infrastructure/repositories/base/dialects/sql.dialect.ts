// src/infrastructure/repositories/base/sql.dialect.ts
import oracledb from "oracledb";
import type { SqlExecuteResult } from "../../../../domain/interfaces/infrastructure/plugins/sql-executor.interface";

export interface BuildInsertParams {
  table: string;
  /** Columnas a escribir, ya en el orden de `values`. */
  columns: string[];
  /** Expresión por columna: un bind (`:b0`) o una expresión del motor. */
  values: string[];
  primaryKeyColumn: string;
  /** `true` si la PK la genera la base y hay que recuperarla. */
  identity: boolean;
}

export interface InsertStatement {
  sql: string;
  /** Binds extra que exige el motor para devolver la PK (Oracle). */
  binds: Record<string, unknown>;
  /** `true` si la sentencia devuelve filas (SQL Server usa OUTPUT). */
  returnsRows: boolean;
}

/**
 * Lo que cambia entre motores al generar SQL. Todo lo demás —el WHERE, el
 * ORDER BY, la proyección, el borrado lógico— es idéntico, así que vive una
 * sola vez en `SqlGenericRepository`.
 */
export interface SqlDialect {
  readonly name: string;
  /** Expresión de fecha y hora del servidor. */
  readonly currentTimestamp: string;
  buildInsert(params: BuildInsertParams): InsertStatement;
  /** Recupera la PK generada del resultado del INSERT. */
  readInsertedId(result: SqlExecuteResult): unknown;
  /**
   * Última conversión antes de entregar un valor al driver. Existe porque no
   * todos los drivers interpretan igual una fecha (ver `sqlServerDialect`).
   */
  toBindValue(value: unknown): unknown;
  /** Cláusula de paginación; ambos motores usan OFFSET/FETCH. */
  buildPagination(hasTake: boolean): string;
}

/** Nombre del bind de salida en Oracle y de la columna OUTPUT en SQL Server. */
const INSERTED_ID = "insertedId";

const PAGINATION = (hasTake: boolean): string =>
  ` OFFSET :pgskip ROWS${hasTake ? " FETCH NEXT :pgtake ROWS ONLY" : ""}`;

/**
 * Oracle recupera la PK con `RETURNING ... INTO`, que necesita un bind de
 * salida y no produce filas.
 */
export const oracleDialect: SqlDialect = {
  name: "oracle",
  currentTimestamp: "SYSTIMESTAMP",

  buildInsert({ table, columns, values, primaryKeyColumn, identity }): InsertStatement {
    const sql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${values.join(", ")})`;

    if (!identity) return { sql, binds: {}, returnsRows: false };

    return {
      sql: `${sql} RETURNING ${primaryKeyColumn} INTO :${INSERTED_ID}`,
      binds: { [INSERTED_ID]: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } },
      returnsRows: false,
    };
  },

  readInsertedId(result) {
    return (result.outBinds?.[INSERTED_ID] as unknown[] | undefined)?.[0];
  },

  // node-oracledb enlaza un Date de JS conservando el instante, así que no hay
  // nada que ajustar.
  toBindValue: (value) => value,

  buildPagination: PAGINATION,
};

/**
 * SQL Server lo hace con la cláusula `OUTPUT INSERTED`, que devuelve la fila
 * generada como un conjunto de resultados. Es preferible a `SCOPE_IDENTITY()`
 * porque no depende del ámbito de la sesión.
 */
export const sqlServerDialect: SqlDialect = {
  name: "mssql",
  currentTimestamp: "SYSDATETIME()",

  buildInsert({ table, columns, values, primaryKeyColumn, identity }): InsertStatement {
    const output = identity ? ` OUTPUT INSERTED.${primaryKeyColumn} AS ${INSERTED_ID}` : "";

    return {
      sql: `INSERT INTO ${table} (${columns.join(", ")})${output} VALUES (${values.join(", ")})`,
      binds: {},
      returnsRows: identity,
    };
  },

  readInsertedId(result) {
    const [row] = result.rows;
    if (!row) return undefined;

    // El driver puede devolver la columna en cualquier caja según la conexión.
    const match = Object.entries(row).find(
      ([column]) => column.toLowerCase() === INSERTED_ID.toLowerCase()
    );
    return match?.[1];
  },

  /**
   * Corrige el desfase horario del ida y vuelta.
   *
   * Sequelize escapa un `Date` como hora **local con offset**
   * (`2026-08-14 21:36:43.000 -06:00`) y SQL Server, al convertirla a DATETIME2,
   * descarta el offset y guarda la parte local. Pero al leer, tedious devuelve
   * DATETIME2 **como si fuera UTC**. El instante acaba desplazado tantas horas
   * como tenga el huso, y con él cualquier comparación que se haga después.
   *
   * Se manda ya en UTC y sin offset, que es justo lo que la lectura asume.
   */
  toBindValue: (value) =>
    value instanceof Date ? value.toISOString().slice(0, 23).replace("T", " ") : value,

  buildPagination: PAGINATION,
};
