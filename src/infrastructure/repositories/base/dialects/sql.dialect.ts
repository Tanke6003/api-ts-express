// src/infrastructure/repositories/base/dialects/sql.dialect.ts
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

/**
 * De dónde sale la PK generada. Es la diferencia que más separa a los motores:
 *
 * - `outBinds`: Oracle, con `RETURNING ... INTO` y un parámetro de salida.
 * - `rows`: SQL Server (`OUTPUT INSERTED`) y PostgreSQL (`RETURNING`), que
 *   devuelven la fila como un conjunto de resultados.
 * - `driver`: MySQL/MariaDB, que no tiene ninguna de las dos y expone el id por
 *   el propio driver (`LAST_INSERT_ID()`).
 * - `none`: la entidad no usa identity, así que no hay id que recuperar.
 */
export type InsertedIdSource = "outBinds" | "rows" | "driver" | "none";

export interface InsertStatement {
  sql: string;
  /** Binds extra que exige el motor para devolver la PK (Oracle). */
  binds: Record<string, unknown>;
  idFrom: InsertedIdSource;
}

/**
 * Lo que cambia entre motores SQL al generar sentencias. Todo lo demás —el
 * WHERE, el ORDER BY, la proyección, el borrado lógico, la auditoría— es
 * idéntico y vive una sola vez en `SqlGenericRepository`.
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
   * todos interpretan igual una fecha (ver `sqlServerDialect`).
   */
  toBindValue(value: unknown): unknown;
  /** Cláusula de paginación. */
  buildPagination(hasTake: boolean): string;
  /**
   * Lectura que bloquea una fila por PK hasta el commit, con el bind `:pk`.
   *
   * Es lo que serializa un caso de uso que decide en función de lo que lee. Los
   * tres motores que hablan SQL estándar lo escriben igual; T-SQL no tiene
   * `FOR UPDATE` y lo resuelve con hints, que es justo el tipo de diferencia que
   * este dialecto existe para absorber.
   */
  buildRowLock(table: string, primaryKeyColumn: string): string;
}

/** Nombre del bind de salida y del alias con el que vuelve la PK generada. */
const INSERTED_ID = "insertedId";

/** OFFSET/FETCH del estándar SQL: lo hablan Oracle, SQL Server y PostgreSQL. */
const STANDARD_PAGINATION = (hasTake: boolean): string =>
  ` OFFSET :pgskip ROWS${hasTake ? " FETCH NEXT :pgtake ROWS ONLY" : ""}`;

const passthrough = (value: unknown): unknown => value;

/**
 * `SELECT ... FOR UPDATE`, que hablan Oracle, PostgreSQL y MySQL/InnoDB. El
 * bloqueo se libera con el commit o el rollback, nunca a mano.
 */
const STANDARD_ROW_LOCK = (table: string, primaryKeyColumn: string): string =>
  `SELECT ${primaryKeyColumn} FROM ${table} WHERE ${primaryKeyColumn} = :pk FOR UPDATE`;

/**
 * Manda las fechas en UTC y sin offset.
 *
 * Sequelize escapa un `Date` como hora **local con offset**; SQL Server y MySQL
 * descartan ese offset al guardarlo en DATETIME2/DATETIME y luego lo leen **como
 * si fuera UTC**. El instante acaba desplazado tantas horas como tenga el huso,
 * y con él cualquier comparación posterior —fue lo que hizo que la regla de
 * solape de citas dejara de detectar cruces—. Enviarlo ya en UTC es justo lo que
 * la lectura asume.
 */
const asUtcWallClock = (value: unknown): unknown =>
  value instanceof Date ? value.toISOString().slice(0, 23).replace("T", " ") : value;

/** Busca la columna sin importar la caja: cada driver la devuelve a su manera. */
function readIdFromRows(result: SqlExecuteResult): unknown {
  const [row] = result.rows;
  if (!row) return undefined;

  const match = Object.entries(row).find(
    ([column]) => column.toLowerCase() === INSERTED_ID.toLowerCase()
  );
  return match?.[1];
}

/**
 * Oracle recupera la PK con `RETURNING ... INTO`, que necesita un bind de
 * salida y no produce filas.
 */
export const oracleDialect: SqlDialect = {
  name: "oracle",
  currentTimestamp: "SYSTIMESTAMP",

  buildInsert({ table, columns, values, primaryKeyColumn, identity }): InsertStatement {
    const sql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${values.join(", ")})`;

    if (!identity) return { sql, binds: {}, idFrom: "none" };

    return {
      sql: `${sql} RETURNING ${primaryKeyColumn} INTO :${INSERTED_ID}`,
      binds: { [INSERTED_ID]: { dir: oracledb.BIND_OUT, type: oracledb.NUMBER } },
      idFrom: "outBinds",
    };
  },

  readInsertedId: (result) =>
    (result.outBinds?.[INSERTED_ID] as unknown[] | undefined)?.[0],

  // node-oracledb enlaza un Date de JS conservando el instante.
  toBindValue: passthrough,
  buildPagination: STANDARD_PAGINATION,
  buildRowLock: STANDARD_ROW_LOCK,
};

/**
 * SQL Server lo hace con `OUTPUT INSERTED`, preferible a `SCOPE_IDENTITY()`
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
      idFrom: identity ? "rows" : "none",
    };
  },

  readInsertedId: readIdFromRows,

  toBindValue: asUtcWallClock,
  buildPagination: STANDARD_PAGINATION,

  /**
   * T-SQL no tiene `FOR UPDATE`; el equivalente son los hints. `UPDLOCK` toma el
   * bloqueo de actualización que impide que dos sesiones lean a la vez con
   * intención de escribir, y `HOLDLOCK` lo mantiene hasta el commit en vez de
   * soltarlo al acabar la sentencia, que es lo que hace falta aquí.
   */
  buildRowLock: (table, primaryKeyColumn) =>
    `SELECT ${primaryKeyColumn} FROM ${table} WITH (UPDLOCK, HOLDLOCK) WHERE ${primaryKeyColumn} = :pk`,
};

/**
 * PostgreSQL usa `RETURNING`, que devuelve la fila insertada.
 *
 * Nota sobre identificadores: Postgres pliega a minúsculas todo lo que no vaya
 * entrecomillado, así que el SQL en mayúsculas que genera el repositorio
 * resuelve contra tablas creadas también sin comillas. El mapeo de columna a
 * propiedad es insensible a la caja, de modo que las columnas que vuelven en
 * minúsculas se resuelven igual.
 */
export const postgresDialect: SqlDialect = {
  name: "postgres",
  currentTimestamp: "NOW()",

  buildInsert({ table, columns, values, primaryKeyColumn, identity }): InsertStatement {
    const sql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${values.join(", ")})`;

    if (!identity) return { sql, binds: {}, idFrom: "none" };

    return {
      sql: `${sql} RETURNING ${primaryKeyColumn} AS ${INSERTED_ID}`,
      binds: {},
      idFrom: "rows",
    };
  },

  readInsertedId: readIdFromRows,
  // node-postgres enlaza un Date respetando el instante, y la columna es
  // TIMESTAMPTZ: no hay nada que ajustar.
  toBindValue: passthrough,
  buildPagination: STANDARD_PAGINATION,
  buildRowLock: STANDARD_ROW_LOCK,
};

/**
 * MySQL y MariaDB no tienen `RETURNING` ni `OUTPUT`: el id generado lo expone
 * el propio driver tras el INSERT. Tampoco entienden `OFFSET ... FETCH NEXT`,
 * así que paginan con `LIMIT`.
 */
export const mysqlDialect: SqlDialect = {
  name: "mysql",
  currentTimestamp: "CURRENT_TIMESTAMP(3)",

  buildInsert({ table, columns, values, identity }): InsertStatement {
    return {
      sql: `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${values.join(", ")})`,
      binds: {},
      idFrom: identity ? "driver" : "none",
    };
  },

  readInsertedId: readIdFromRows,
  // Mismo desfase que SQL Server: DATETIME tampoco guarda el offset.
  toBindValue: asUtcWallClock,

  /**
   * MySQL exige `LIMIT` para poder usar `OFFSET`. Cuando sólo hay desplazamiento
   * se pone el máximo que admite, que es el truco documentado por el propio
   * manual para «desde la fila N hasta el final».
   */
  buildPagination: (hasTake) =>
    hasTake ? " LIMIT :pgtake OFFSET :pgskip" : " LIMIT 18446744073709551615 OFFSET :pgskip",

  buildRowLock: STANDARD_ROW_LOCK,
};
