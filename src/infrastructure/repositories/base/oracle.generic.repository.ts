// src/infrastructure/repositories/base/oracle.generic.repository.ts
import oracledb from "oracledb";
import type {
  IGenericRepository,
  IQueryable,
  OrderByClause,
  PagedResult,
  QueryOptions,
  WhereFilter,
} from "../../../domain/interfaces/infrastructure/repositories/generic.repository.interface";
import type { IOracleExecutor } from "../../../domain/interfaces/infrastructure/plugins/oracle.plugin.interface";
import type { ILogger } from "../../../domain/interfaces/infrastructure/plugins/logger.plugin.interface";
import { EntityMetadata, EntitySchema } from "./entity-metadata";
import { OracleWhereCompiler } from "./oracle.where.compiler";
import { QueryBuilder } from "./query-builder";
import { normalizeOrderBy } from "./filter.helpers";

/**
 * Repositorio genérico sobre Oracle.
 *
 * Genera el SQL de todo el CRUD a partir del `EntityMetadata` de la entidad, así
 * que un módulo nuevo sólo describe su tabla y ya tiene getAll, getById, insert,
 * update, borrado lógico, borrado físico y consultas encadenables.
 *
 * Todo valor viaja como bind nombrado y todo identificador sale del mapeo, de
 * modo que no hay concatenación de datos de usuario dentro del SQL.
 *
 * Depende de un `IOracleExecutor`, no del pool: eso permite construir una copia
 * enlazada a una transacción (`withExecutor`) sin duplicar nada de la lógica.
 */
export class OracleGenericRepository<T extends object, TKey = number>
  implements IGenericRepository<T, TKey>
{
  readonly schema: EntitySchema<T>;

  constructor(
    private readonly db: IOracleExecutor,
    private readonly metadata: EntityMetadata<T>,
    private readonly logger: ILogger
  ) {
    this.schema = new EntitySchema(metadata);
  }

  /**
   * Devuelve el mismo repositorio ejecutando contra otro *executor*, típicamente
   * el contexto de una transacción. Lo usa la unidad de trabajo.
   */
  withExecutor(executor: IOracleExecutor): OracleGenericRepository<T, TKey> {
    return new OracleGenericRepository<T, TKey>(executor, this.metadata, this.logger);
  }

  // ------------------------------------------------------------ helpers ----

  /**
   * Añade el filtro de borrado lógico salvo que se pidan explícitamente los
   * registros borrados. Es el equivalente al *query filter* global de EF Core.
   */
  private withSoftDeleteFilter(
    where: WhereFilter<T> | undefined,
    withDeleted?: boolean
  ): WhereFilter<T> | undefined {
    const softDelete = this.schema.softDelete;
    if (!softDelete || withDeleted) return where;

    const activeOnly = {
      [softDelete.property]: { eq: this.schema.softDeleteActiveValue },
    } as WhereFilter<T>;

    return where ? ({ $and: [where, activeOnly] } as WhereFilter<T>) : activeOnly;
  }

  private selectList(select?: Extract<keyof T, string>[]): string {
    const properties = select?.length ? select : this.schema.properties;
    return properties.map((property) => this.schema.columnOf(property)).join(", ");
  }

  /**
   * @param deterministic Oracle no garantiza el orden de un OFFSET/FETCH sin
   * ORDER BY, así que al paginar caemos a la PK cuando no se pidió orden.
   */
  private orderByClause(
    orderBy: OrderByClause<T> | OrderByClause<T>[] | undefined,
    deterministic: boolean
  ): string {
    const clauses = normalizeOrderBy(orderBy);

    if (clauses.length === 0) {
      return deterministic ? ` ORDER BY ${this.schema.columnOf(this.schema.primaryKey)}` : "";
    }

    const rendered = clauses
      .map(
        (clause) =>
          `${this.schema.columnOf(clause.field)} ${clause.direction === "desc" ? "DESC" : "ASC"}`
      )
      .join(", ");

    return ` ORDER BY ${rendered}`;
  }

  private mapRows(rows: Record<string, unknown>[]): T[] {
    return rows.map((row) => this.schema.toEntity(row));
  }

  // -------------------------------------------------------------- lectura ---

  async find(options: QueryOptions<T> = {}): Promise<T[]> {
    const compiler = new OracleWhereCompiler<T>(this.schema);
    const where = compiler.compile(this.withSoftDeleteFilter(options.where, options.withDeleted));

    const paginated = options.skip !== undefined || options.take !== undefined;
    let sql = `SELECT ${this.selectList(options.select)} FROM ${this.schema.table}`;
    if (where.sql) sql += ` WHERE ${where.sql}`;
    sql += this.orderByClause(options.orderBy, paginated);

    const binds: Record<string, unknown> = { ...where.binds };
    if (paginated) {
      sql += " OFFSET :pgskip ROWS";
      binds.pgskip = options.skip ?? 0;
      if (options.take !== undefined) {
        sql += " FETCH NEXT :pgtake ROWS ONLY";
        binds.pgtake = options.take;
      }
    }

    const result = await this.db.execute<Record<string, unknown>>(sql, binds);
    return this.mapRows(result.rows);
  }

  getAll(options: QueryOptions<T> = {}): Promise<T[]> {
    return this.find(options);
  }

  async firstOrDefault(options: QueryOptions<T> = {}): Promise<T | null> {
    const rows = await this.find({ ...options, take: 1 });
    return rows[0] ?? null;
  }

  async getById(
    id: TKey,
    options: Pick<QueryOptions<T>, "select" | "withDeleted"> = {}
  ): Promise<T | null> {
    return this.firstOrDefault({
      where: { [this.schema.primaryKey]: id } as WhereFilter<T>,
      select: options.select,
      withDeleted: options.withDeleted,
    });
  }

  async count(where?: WhereFilter<T>, withDeleted?: boolean): Promise<number> {
    const compiler = new OracleWhereCompiler<T>(this.schema);
    const compiled = compiler.compile(this.withSoftDeleteFilter(where, withDeleted));

    let sql = `SELECT COUNT(*) AS TOTAL FROM ${this.schema.table}`;
    if (compiled.sql) sql += ` WHERE ${compiled.sql}`;

    const result = await this.db.execute<{ TOTAL: number }>(sql, compiled.binds);
    return Number(result.rows[0]?.TOTAL ?? 0);
  }

  async exists(where: WhereFilter<T>, withDeleted?: boolean): Promise<boolean> {
    return (await this.count(where, withDeleted)) > 0;
  }

  async getPaged(
    page: number,
    limit: number,
    options: Omit<QueryOptions<T>, "skip" | "take"> = {}
  ): Promise<PagedResult<T>> {
    const safePage = Math.max(1, Math.trunc(page) || 1);
    const safeLimit = Math.max(1, Math.trunc(limit) || 1);

    const total = await this.count(options.where, options.withDeleted);
    const items = await this.find({
      ...options,
      skip: (safePage - 1) * safeLimit,
      take: safeLimit,
    });

    return {
      items,
      total,
      page: safePage,
      limit: safeLimit,
      pages: Math.ceil(total / safeLimit),
    };
  }

  // -------------------------------------------------------------- escritura -

  async insert(entity: Partial<T>): Promise<T> {
    const { createdAt } = this.schema.timestamps ?? {};
    const columns: string[] = [];
    const values: string[] = [];
    const binds: Record<string, unknown> = {};

    for (const property of this.schema.insertableProperties()) {
      // Las marcas de tiempo las pone la base, para que no dependan del reloj
      // del proceso Node.
      if (property === createdAt) continue;

      const value = (entity as Record<string, unknown>)[property];
      if (value === undefined) continue;

      const bindName = `b${columns.length}`;
      columns.push(this.schema.columnOf(property));
      values.push(`:${bindName}`);
      binds[bindName] = this.schema.toColumnValue(property, value);
    }

    // Se comprueba antes de añadir la marca de tiempo: si no, una entidad con
    // `createdAt` siempre tendría una columna y un insert vacío colaría,
    // escribiendo una fila sin datos.
    if (columns.length === 0) {
      throw new Error(
        `[OracleGenericRepository] insert en ${this.schema.table} sin columnas que escribir.`
      );
    }

    if (createdAt) {
      columns.push(this.schema.columnOf(createdAt));
      values.push("SYSTIMESTAMP");
    }

    let sql = `INSERT INTO ${this.schema.table} (${columns.join(", ")}) VALUES (${values.join(", ")})`;

    const primaryKeyColumn = this.schema.columnOf(this.schema.primaryKey);
    if (this.schema.isIdentity) {
      // RETURNING ... INTO es la forma de recuperar el valor de una IDENTITY sin
      // una segunda consulta ni depender de secuencias con nombre.
      sql += ` RETURNING ${primaryKeyColumn} INTO :outpk`;
      binds.outpk = { dir: oracledb.BIND_OUT, type: oracledb.NUMBER };
    }

    const result = await this.db.execute(sql, binds);

    const id = this.schema.isIdentity
      ? ((result.outBinds?.outpk as unknown[] | undefined)?.[0] as TKey)
      : ((entity as Record<string, unknown>)[this.schema.primaryKey] as TKey);

    const created = await this.getById(id, { withDeleted: true });
    if (!created) {
      throw new Error(
        `[OracleGenericRepository] La fila insertada en ${this.schema.table} no se pudo releer (pk=${String(id)}).`
      );
    }

    this.logger.debug("Registro insertado", { table: this.schema.table, id });
    return created;
  }

  async insertMany(entities: Partial<T>[]): Promise<number> {
    if (entities.length === 0) return 0;

    const { createdAt } = this.schema.timestamps ?? {};

    // `executeMany` exige una única sentencia, así que se toma la unión de las
    // propiedades presentes y las que falten en una fila viajan como NULL.
    const properties = this.schema
      .insertableProperties()
      .filter((property) => property !== createdAt)
      .filter((property) =>
        entities.some((entity) => (entity as Record<string, unknown>)[property] !== undefined)
      );

    if (properties.length === 0) {
      throw new Error(
        `[OracleGenericRepository] insertMany en ${this.schema.table} sin columnas que escribir.`
      );
    }

    const columns = properties.map((property) => this.schema.columnOf(property));
    const placeholders = properties.map((_, index) => `:b${index}`);

    if (createdAt) {
      columns.push(this.schema.columnOf(createdAt));
      placeholders.push("SYSTIMESTAMP");
    }

    const sql = `INSERT INTO ${this.schema.table} (${columns.join(", ")}) VALUES (${placeholders.join(", ")})`;

    const rows = entities.map((entity) => {
      const row: Record<string, unknown> = {};
      properties.forEach((property, index) => {
        row[`b${index}`] = this.schema.toColumnValue(
          property,
          (entity as Record<string, unknown>)[property]
        );
      });
      return row;
    });

    const affected = await this.db.executeMany(sql, rows);
    this.logger.debug("Inserción masiva", { table: this.schema.table, affected });
    return affected;
  }

  /**
   * Construye el `SET` de un UPDATE. Devuelve `null` si el cambio no toca
   * ninguna columna actualizable.
   */
  private buildSetClause(changes: Partial<T>): { sql: string; binds: Record<string, unknown> } | null {
    const { updatedAt } = this.schema.timestamps ?? {};
    const assignments: string[] = [];
    const binds: Record<string, unknown> = {};

    for (const property of this.schema.updatableProperties()) {
      if (property === updatedAt) continue;

      const value = (changes as Record<string, unknown>)[property];
      if (value === undefined) continue;

      const bindName = `s${assignments.length}`;
      assignments.push(`${this.schema.columnOf(property)} = :${bindName}`);
      binds[bindName] = this.schema.toColumnValue(property, value);
    }

    if (assignments.length === 0) return null;

    if (updatedAt) {
      assignments.push(`${this.schema.columnOf(updatedAt)} = SYSTIMESTAMP`);
    }

    return { sql: assignments.join(", "), binds };
  }

  private async executeUpdate(
    setClause: { sql: string; binds: Record<string, unknown> },
    where: WhereFilter<T>
  ): Promise<number> {
    // Prefijo distinto para los binds del WHERE: si no, chocarían con los del SET.
    const compiler = new OracleWhereCompiler<T>(this.schema, "w");
    const compiled = compiler.compile(this.withSoftDeleteFilter(where));

    let sql = `UPDATE ${this.schema.table} SET ${setClause.sql}`;
    if (compiled.sql) sql += ` WHERE ${compiled.sql}`;

    const result = await this.db.execute(sql, { ...setClause.binds, ...compiled.binds });
    return result.rowsAffected;
  }

  async update(id: TKey, changes: Partial<T>): Promise<T | null> {
    const setClause = this.buildSetClause(changes);
    // Un update vacío no es un error: simplemente devuelve el estado actual. Si
    // devolviéramos `null` el llamador lo leería como "no existe".
    if (!setClause) return this.getById(id);

    const affected = await this.executeUpdate(setClause, {
      [this.schema.primaryKey]: id,
    } as WhereFilter<T>);

    if (affected === 0) return null;
    return this.getById(id);
  }

  /** Nota: no alcanza a los registros con borrado lógico. */
  async updateWhere(where: WhereFilter<T>, changes: Partial<T>): Promise<number> {
    const setClause = this.buildSetClause(changes);
    if (!setClause) return 0;
    return this.executeUpdate(setClause, where);
  }

  // ---------------------------------------------------------------- borrado -

  private requireSoftDelete(): void {
    if (!this.schema.softDelete) {
      throw new Error(
        `[OracleGenericRepository] La entidad ${this.schema.table} no declara softDelete; ` +
          "usa hardDelete o añade la metadata."
      );
    }
  }

  /** Cambia la marca de borrado lógico y devuelve si afectó alguna fila. */
  private async setSoftDeleteFlag(id: TKey, deleted: boolean): Promise<boolean> {
    this.requireSoftDelete();

    const softDelete = this.schema.softDelete!;
    const column = this.schema.columnOf(softDelete.property);
    const { updatedAt } = this.schema.timestamps ?? {};

    const assignments = [`${column} = :flag`];
    if (updatedAt) assignments.push(`${this.schema.columnOf(updatedAt)} = SYSTIMESTAMP`);

    // La condición sobre el estado previo hace la operación idempotente: borrar
    // dos veces devuelve `false` la segunda, en vez de fingir que hizo algo.
    const sql =
      `UPDATE ${this.schema.table} SET ${assignments.join(", ")} ` +
      `WHERE ${this.schema.columnOf(this.schema.primaryKey)} = :pk AND ${column} = :previous`;

    const result = await this.db.execute(sql, {
      flag: deleted ? this.schema.softDeleteDeletedValue : this.schema.softDeleteActiveValue,
      pk: id,
      previous: deleted ? this.schema.softDeleteActiveValue : this.schema.softDeleteDeletedValue,
    });

    return result.rowsAffected > 0;
  }

  async softDelete(id: TKey): Promise<boolean> {
    const deleted = await this.setSoftDeleteFlag(id, true);
    if (deleted) this.logger.warn("Borrado lógico", { table: this.schema.table, id });
    return deleted;
  }

  async restore(id: TKey): Promise<boolean> {
    const restored = await this.setSoftDeleteFlag(id, false);
    if (restored) this.logger.info("Registro restaurado", { table: this.schema.table, id });
    return restored;
  }

  async hardDelete(id: TKey): Promise<boolean> {
    const sql = `DELETE FROM ${this.schema.table} WHERE ${this.schema.columnOf(this.schema.primaryKey)} = :pk`;
    const result = await this.db.execute(sql, { pk: id });

    const deleted = result.rowsAffected > 0;
    if (deleted) this.logger.warn("Borrado físico", { table: this.schema.table, id });
    return deleted;
  }

  async hardDeleteWhere(where: WhereFilter<T>): Promise<number> {
    const compiler = new OracleWhereCompiler<T>(this.schema);
    // Sin filtro de borrado lógico: aquí el objetivo es limpiar de verdad.
    const compiled = compiler.compile(where);

    let sql = `DELETE FROM ${this.schema.table}`;
    if (compiled.sql) sql += ` WHERE ${compiled.sql}`;

    const result = await this.db.execute(sql, compiled.binds);
    if (result.rowsAffected > 0) {
      this.logger.warn("Borrado físico masivo", {
        table: this.schema.table,
        affected: result.rowsAffected,
      });
    }
    return result.rowsAffected;
  }

  query(): IQueryable<T> {
    return new QueryBuilder<T, TKey>(this);
  }

  /**
   * Vía de escape para lo que el API genérica no expresa a propósito
   * —agregaciones, `GROUP BY`, vistas, procedimientos—.
   *
   * La usan los repositorios de módulo cuando declaran métodos extra sobre su
   * interfaz propia. Los valores siguen viajando como binds; el SQL lo escribe
   * quien llama, así que nunca debe construirse concatenando entrada de usuario.
   */
  async executeRaw<TRow = Record<string, unknown>>(
    sql: string,
    binds: Record<string, unknown> = {}
  ): Promise<TRow[]> {
    const result = await this.db.execute<TRow>(sql, binds);
    return result.rows;
  }
}
