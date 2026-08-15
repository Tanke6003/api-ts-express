// src/infrastructure/repositories/base/sql.generic.repository.ts
import type {
  IGenericRepository,
  IQueryable,
  OrderByClause,
  PagedResult,
  QueryOptions,
  WhereFilter,
} from "../../../../domain/interfaces/infrastructure/repositories/generic.repository.interface";
import type {
  ISqlExecutor,
  SqlExecuteResult,
} from "../../../../domain/interfaces/infrastructure/plugins/sql-executor.interface";
import type { ILogger } from "../../../../domain/interfaces/infrastructure/plugins/logger.plugin.interface";
import type { IRequestContext } from "../../../../domain/interfaces/infrastructure/plugins/request-context.plugin.interface";
import { SYSTEM_USER } from "../../../plugins/asyncRequestContext.plugin";
import { EntityMetadata, EntitySchema } from "../entity-metadata";
import { SqlWhereCompiler } from "../query/sql.where.compiler";
import { QueryBuilder } from "../query/query-builder";
import { normalizeOrderBy } from "../query/filter.helpers";
import type { SqlDialect } from "../dialects/sql.dialect";
import type {
  AuditActor,
  IAuditTrail,
} from "../../../../domain/interfaces/infrastructure/repositories/audit-trail.interface";
import type { AuditAction } from "../../../../domain/models/audit-log.model";

/**
 * Repositorio genérico sobre SQL.
 *
 * Genera el SQL de todo el CRUD a partir del `EntityMetadata` de la entidad, así
 * que un módulo nuevo sólo describe su tabla y ya tiene getAll, getById, insert,
 * update, borrado lógico, borrado físico y consultas encadenables.
 *
 * Lo que cambia entre motores está aislado en `SqlDialect` —cómo se recupera una
 * PK generada y cómo se escribe la fecha del servidor—; el resto del SQL es
 * común, así que Oracle y SQL Server comparten esta única implementación.
 *
 * Todo valor viaja como bind nombrado y todo identificador sale del mapeo, de
 * modo que no hay concatenación de datos de usuario dentro del SQL.
 */
export class SqlGenericRepository<T extends object, TKey = number>
  implements IGenericRepository<T, TKey>
{
  readonly schema: EntitySchema<T>;

  constructor(
    protected readonly db: ISqlExecutor,
    protected readonly metadata: EntityMetadata<T>,
    protected readonly logger: ILogger,
    protected readonly dialect: SqlDialect,
    /** Provee el usuario de auditoría. Sin él todo se escribe como "System". */
    protected readonly context?: IRequestContext,
    /** Bitácora de cambios; sólo actúa si la entidad la tiene activada. */
    protected readonly auditTrail?: IAuditTrail
  ) {
    this.schema = new EntitySchema(metadata);
  }

  /** La bitácora es opt-in por entidad, para no registrar tablas auxiliares. */
  protected trailEnabled(): boolean {
    return Boolean(this.auditTrail && this.schema.auditTrail);
  }

  /**
   * Registra la operación. Va por el mismo executor, así que dentro de una
   * transacción entra en el mismo commit; si falla, falla la operación entera.
   */
  /**
   * Fotografía de quién pide, tomada antes del primer await de la operación.
   * Después ya no es fiable: el pool del driver puede resolver sus callbacks
   * en el contexto en que se creó y no en el de la petición.
   */
  protected captureActor(): AuditActor {
    return {
      changedBy: this.auditUser(),
      requestId: this.context?.getRequestId() ?? null,
    };
  }

  protected async recordAudit(
    actor: AuditActor,
    action: AuditAction,
    entityId?: unknown,
    changes?: Record<string, unknown>
  ): Promise<void> {
    if (!this.trailEnabled()) return;
    await this.auditTrail!.record({
      entity: this.schema.table,
      actor,
      entityId,
      action,
      changes,
    });
  }

  /**
   * Devuelve el mismo repositorio ejecutando contra otro *executor*, típicamente
   * el contexto de una transacción. Lo usa la unidad de trabajo.
   */
  withExecutor(executor: ISqlExecutor): SqlGenericRepository<T, TKey> {
    return new SqlGenericRepository<T, TKey>(
      executor,
      this.metadata,
      this.logger,
      this.dialect,
      this.context,
      // La bitácora también se ata a la transacción: si ésta revierte, su
      // línea desaparece con ella.
      this.auditTrail?.bindTo(executor)
    );
  }

  /** Usuario que queda registrado en las columnas de auditoría. */
  protected auditUser(): string {
    return this.context?.getCurrentUserName() ?? SYSTEM_USER;
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
   * @param deterministic Ni Oracle ni SQL Server garantizan el orden de un
   * OFFSET/FETCH sin ORDER BY —y SQL Server directamente lo exige—, así que al
   * paginar caemos a la PK cuando no se pidió orden.
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
    const compiler = new SqlWhereCompiler<T>(this.schema, "w", this.dialect.toBindValue);
    const where = compiler.compile(this.withSoftDeleteFilter(options.where, options.withDeleted));

    const paginated = options.skip !== undefined || options.take !== undefined;
    let sql = `SELECT ${this.selectList(options.select)} FROM ${this.schema.table}`;
    if (where.sql) sql += ` WHERE ${where.sql}`;
    sql += this.orderByClause(options.orderBy, paginated);

    const binds: Record<string, unknown> = { ...where.binds };
    if (paginated) {
      sql += this.dialect.buildPagination(options.take !== undefined);
      binds.pgskip = options.skip ?? 0;
      if (options.take !== undefined) binds.pgtake = options.take;
    }

    const result = await this.db.execute<Record<string, unknown>>(sql, binds, { expects: "rows" });
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
    const compiler = new SqlWhereCompiler<T>(this.schema, "w", this.dialect.toBindValue);
    const compiled = compiler.compile(this.withSoftDeleteFilter(where, withDeleted));

    let sql = `SELECT COUNT(*) AS TOTAL FROM ${this.schema.table}`;
    if (compiled.sql) sql += ` WHERE ${compiled.sql}`;

    const result = await this.db.execute<{ TOTAL: number; total?: number }>(sql, compiled.binds, {
      expects: "rows",
    });

    const [row] = result.rows;
    return Number(row?.TOTAL ?? row?.total ?? 0);
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
    const actor = this.captureActor();
    const { createdAt } = this.schema.timestamps ?? {};
    const { createdBy, updatedBy } = this.schema.audit ?? {};
    const columns: string[] = [];
    const values: string[] = [];
    const binds: Record<string, unknown> = {};

    for (const property of this.schema.insertableProperties()) {
      // Las marcas de tiempo las pone la base, para que no dependan del reloj
      // del proceso Node. Las de auditoría salen del contexto y nunca del
      // cuerpo de la petición: si no, el cliente podría falsear quién escribió.
      if (property === createdAt || property === createdBy || property === updatedBy) continue;

      const value = (entity as Record<string, unknown>)[property];
      if (value === undefined) continue;

      const bindName = `b${columns.length}`;
      columns.push(this.schema.columnOf(property));
      values.push(`:${bindName}`);
      binds[bindName] = this.dialect.toBindValue(this.schema.toColumnValue(property, value));
    }

    // Se comprueba antes de añadir la marca de tiempo: si no, una entidad con
    // `createdAt` siempre tendría una columna y un insert vacío colaría,
    // escribiendo una fila sin datos.
    if (columns.length === 0) {
      throw new Error(
        `[SqlGenericRepository] insert en ${this.schema.table} sin columnas que escribir.`
      );
    }

    if (createdAt) {
      columns.push(this.schema.columnOf(createdAt));
      values.push(this.dialect.currentTimestamp);
    }

    if (createdBy) {
      columns.push(this.schema.columnOf(createdBy));
      values.push(":auditUser");
      binds.auditUser = this.auditUser();
    }

    const statement = this.dialect.buildInsert({
      table: this.schema.table,
      columns,
      values,
      primaryKeyColumn: this.schema.columnOf(this.schema.primaryKey),
      identity: this.schema.isIdentity,
    });

    // Qué se le pide al executor depende de por dónde devuelva el motor la PK.
    const expects =
      statement.idFrom === "rows" ? "rows" : statement.idFrom === "driver" ? "identity" : "affected";

    const result = await this.db.execute(statement.sql, { ...binds, ...statement.binds }, { expects });

    const id = this.schema.isIdentity
      ? (this.dialect.readInsertedId(result as SqlExecuteResult) as TKey)
      : ((entity as Record<string, unknown>)[this.schema.primaryKey] as TKey);

    const created = await this.getById(id, { withDeleted: true });
    if (!created) {
      throw new Error(
        `[SqlGenericRepository] La fila insertada en ${this.schema.table} no se pudo releer (pk=${String(id)}).`
      );
    }

    await this.recordAudit(actor, "INSERT", id, { after: created as Record<string, unknown> });

    this.logger.debug("Registro insertado", { table: this.schema.table, id });
    return created;
  }

  async insertMany(entities: Partial<T>[]): Promise<number> {
    const actor = this.captureActor();
    if (entities.length === 0) return 0;

    const { createdAt } = this.schema.timestamps ?? {};
    const { createdBy, updatedBy } = this.schema.audit ?? {};

    // `executeMany` exige una única sentencia, así que se toma la unión de las
    // propiedades presentes y las que falten en una fila viajan como NULL.
    const properties = this.schema
      .insertableProperties()
      .filter(
        (property) => property !== createdAt && property !== createdBy && property !== updatedBy
      )
      .filter((property) =>
        entities.some((entity) => (entity as Record<string, unknown>)[property] !== undefined)
      );

    if (properties.length === 0) {
      throw new Error(
        `[SqlGenericRepository] insertMany en ${this.schema.table} sin columnas que escribir.`
      );
    }

    const columns = properties.map((property) => this.schema.columnOf(property));
    const placeholders = properties.map((_, index) => `:b${index}`);

    if (createdAt) {
      columns.push(this.schema.columnOf(createdAt));
      placeholders.push(this.dialect.currentTimestamp);
    }

    if (createdBy) {
      columns.push(this.schema.columnOf(createdBy));
      placeholders.push(":auditUser");
    }

    const sql = `INSERT INTO ${this.schema.table} (${columns.join(", ")}) VALUES (${placeholders.join(", ")})`;

    const auditUser = this.auditUser();
    const rows = entities.map((entity) => {
      const row: Record<string, unknown> = {};
      properties.forEach((property, index) => {
        row[`b${index}`] = this.dialect.toBindValue(
          this.schema.toColumnValue(property, (entity as Record<string, unknown>)[property])
        );
      });
      if (createdBy) row.auditUser = auditUser;
      return row;
    });

    const affected = await this.db.executeMany(sql, rows);
    await this.recordAudit(actor, "INSERT_MANY", undefined, { affected });

    this.logger.debug("Inserción masiva", { table: this.schema.table, affected });
    return affected;
  }

  /**
   * Construye el `SET` de un UPDATE. Devuelve `null` si el cambio no toca
   * ninguna columna actualizable.
   */
  private buildSetClause(changes: Partial<T>): { sql: string; binds: Record<string, unknown> } | null {
    const { updatedAt } = this.schema.timestamps ?? {};
    const { createdBy, updatedBy } = this.schema.audit ?? {};
    const assignments: string[] = [];
    const binds: Record<string, unknown> = {};

    for (const property of this.schema.updatableProperties()) {
      if (property === updatedAt || property === createdBy || property === updatedBy) continue;

      const value = (changes as Record<string, unknown>)[property];
      if (value === undefined) continue;

      const bindName = `s${assignments.length}`;
      assignments.push(`${this.schema.columnOf(property)} = :${bindName}`);
      binds[bindName] = this.dialect.toBindValue(this.schema.toColumnValue(property, value));
    }

    if (assignments.length === 0) return null;

    if (updatedAt) {
      assignments.push(`${this.schema.columnOf(updatedAt)} = ${this.dialect.currentTimestamp}`);
    }

    if (updatedBy) {
      assignments.push(`${this.schema.columnOf(updatedBy)} = :auditUser`);
      binds.auditUser = this.auditUser();
    }

    return { sql: assignments.join(", "), binds };
  }

  private async executeUpdate(
    setClause: { sql: string; binds: Record<string, unknown> },
    where: WhereFilter<T>
  ): Promise<number> {
    // Prefijo distinto para los binds del WHERE: si no, chocarían con los del SET.
    const compiler = new SqlWhereCompiler<T>(this.schema, "w", this.dialect.toBindValue);
    const compiled = compiler.compile(this.withSoftDeleteFilter(where));

    let sql = `UPDATE ${this.schema.table} SET ${setClause.sql}`;
    if (compiled.sql) sql += ` WHERE ${compiled.sql}`;

    const result = await this.db.execute(
      sql,
      { ...setClause.binds, ...compiled.binds },
      { expects: "affected" }
    );
    return result.rowsAffected;
  }

  async update(id: TKey, changes: Partial<T>): Promise<T | null> {
    const actor = this.captureActor();
    const setClause = this.buildSetClause(changes);
    // Un update vacío no es un error: simplemente devuelve el estado actual. Si
    // devolviéramos `null` el llamador lo leería como "no existe".
    if (!setClause) return this.getById(id);

    // El estado previo sólo se lee si hay bitácora: si no, sobra una consulta.
    const before = this.trailEnabled() ? await this.getById(id) : null;

    const affected = await this.executeUpdate(setClause, {
      [this.schema.primaryKey]: id,
    } as WhereFilter<T>);

    if (affected === 0) return null;

    const updated = await this.getById(id);
    await this.recordAudit(actor, "UPDATE", id, {
      before: before as Record<string, unknown> | null,
      after: updated as Record<string, unknown> | null,
    });

    return updated;
  }

  /** Nota: no alcanza a los registros con borrado lógico. */
  async updateWhere(where: WhereFilter<T>, changes: Partial<T>): Promise<number> {
    const actor = this.captureActor();
    const setClause = this.buildSetClause(changes);
    if (!setClause) return 0;

    const affected = await this.executeUpdate(setClause, where);
    // En una operación masiva no se registra fila a fila: la bitácora saldría
    // más cara que la propia operación. Se guarda qué se pidió y a cuántas alcanzó.
    await this.recordAudit(actor, "UPDATE_MANY", undefined, {
      changes: changes as Record<string, unknown>,
      affected,
    });

    return affected;
  }

  // ---------------------------------------------------------------- borrado -

  private requireSoftDelete(): void {
    if (!this.schema.softDelete) {
      throw new Error(
        `[SqlGenericRepository] La entidad ${this.schema.table} no declara softDelete; ` +
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
    if (updatedAt) {
      assignments.push(`${this.schema.columnOf(updatedAt)} = ${this.dialect.currentTimestamp}`);
    }

    // Un borrado lógico es una modificación: debe dejar rastro de quién la hizo.
    const { updatedBy } = this.schema.audit ?? {};
    if (updatedBy) assignments.push(`${this.schema.columnOf(updatedBy)} = :auditUser`);

    // La condición sobre el estado previo hace la operación idempotente: borrar
    // dos veces devuelve `false` la segunda, en vez de fingir que hizo algo.
    const sql =
      `UPDATE ${this.schema.table} SET ${assignments.join(", ")} ` +
      `WHERE ${this.schema.columnOf(this.schema.primaryKey)} = :pk AND ${column} = :previous`;

    const result = await this.db.execute(
      sql,
      {
        flag: deleted ? this.schema.softDeleteDeletedValue : this.schema.softDeleteActiveValue,
        pk: id,
        previous: deleted ? this.schema.softDeleteActiveValue : this.schema.softDeleteDeletedValue,
        ...(updatedBy ? { auditUser: this.auditUser() } : {}),
      },
      { expects: "affected" }
    );

    return result.rowsAffected > 0;
  }

  async softDelete(id: TKey): Promise<boolean> {
    const actor = this.captureActor();
    const deleted = await this.setSoftDeleteFlag(id, true);
    if (deleted) {
      await this.recordAudit(actor, "SOFT_DELETE", id);
      this.logger.warn("Borrado lógico", { table: this.schema.table, id });
    }
    return deleted;
  }

  async restore(id: TKey): Promise<boolean> {
    const actor = this.captureActor();
    const restored = await this.setSoftDeleteFlag(id, false);
    if (restored) {
      await this.recordAudit(actor, "RESTORE", id);
      this.logger.info("Registro restaurado", { table: this.schema.table, id });
    }
    return restored;
  }

  async hardDelete(id: TKey): Promise<boolean> {
    const actor = this.captureActor();
    // La fila está a punto de desaparecer: si hay bitácora, se guarda antes.
    const before = this.trailEnabled() ? await this.getById(id, { withDeleted: true }) : null;

    const sql = `DELETE FROM ${this.schema.table} WHERE ${this.schema.columnOf(this.schema.primaryKey)} = :pk`;
    const result = await this.db.execute(sql, { pk: id }, { expects: "affected" });

    const deleted = result.rowsAffected > 0;
    if (deleted) {
      await this.recordAudit(actor, "HARD_DELETE", id, {
        before: before as Record<string, unknown> | null,
      });
      this.logger.warn("Borrado físico", { table: this.schema.table, id });
    }
    return deleted;
  }

  async hardDeleteWhere(where: WhereFilter<T>): Promise<number> {
    const actor = this.captureActor();
    const compiler = new SqlWhereCompiler<T>(this.schema, "w", this.dialect.toBindValue);
    // Sin filtro de borrado lógico: aquí el objetivo es limpiar de verdad.
    const compiled = compiler.compile(where);

    let sql = `DELETE FROM ${this.schema.table}`;
    if (compiled.sql) sql += ` WHERE ${compiled.sql}`;

    const result = await this.db.execute(sql, compiled.binds, { expects: "affected" });
    if (result.rowsAffected > 0) {
      await this.recordAudit(actor, "HARD_DELETE_MANY", undefined, {
        affected: result.rowsAffected,
      });
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
   * Bloquea una fila por PK hasta el commit. Sólo tiene sentido sobre un
   * executor de transacción: con auto-commit el bloqueo se suelta al terminar la
   * propia sentencia y no protege nada, por eso quien lo expone es la unidad de
   * trabajo y no el contrato del repositorio.
   *
   * No filtra por borrado lógico: se bloquea la fila que existe, y si además
   * está dada de baja eso lo decide quien llama con su propia lectura.
   *
   * @returns `false` si la fila no existe.
   */
  async lockById(id: TKey): Promise<boolean> {
    const sql = this.dialect.buildRowLock(
      this.schema.table,
      this.schema.columnOf(this.schema.primaryKey)
    );

    const result = await this.db.execute(sql, { pk: id }, { expects: "rows" });
    return result.rows.length > 0;
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
    const result = await this.db.execute<TRow>(sql, binds, { expects: "rows" });
    return result.rows;
  }
}
