// src/infrastructure/repositories/base/drivers/mongo.generic.repository.ts
import type { ClientSession, Collection, Document } from "mongodb";
import type {
  IGenericRepository,
  IQueryable,
  OrderByClause,
  PagedResult,
  QueryOptions,
  WhereFilter,
} from "../../../../domain/interfaces/infrastructure/repositories/generic.repository.interface";
import type { ILogger } from "../../../../domain/interfaces/infrastructure/plugins/logger.plugin.interface";
import type { IRequestContext } from "../../../../domain/interfaces/infrastructure/plugins/request-context.plugin.interface";
import type {
  AuditActor,
  IAuditTrail,
} from "../../../../domain/interfaces/infrastructure/repositories/audit-trail.interface";
import type { AuditAction } from "../../../../domain/models/audit-log.model";
import { SYSTEM_USER } from "../../../plugins/asyncRequestContext.plugin";
import { EntityMetadata, EntitySchema } from "../entity-metadata";
import { toMongoFilter } from "../query/mongo.filter";
import { QueryBuilder } from "../query/query-builder";
import { normalizeOrderBy } from "../query/filter.helpers";

/**
 * Lo único que este repositorio necesita del conector: una colección por
 * nombre. Se declara aquí, y no en el dominio, porque `Collection` es un tipo
 * del driver: el dominio no debe conocerlo. `MongoDbPlugin` lo cumple sin
 * declararlo, por estructura.
 */
export interface IMongoDataSource {
  collection<TDoc extends Document = Document>(name: string): Promise<Collection<TDoc>>;
}

/**
 * Colección de contadores, el patrón canónico para emular una secuencia en
 * MongoDB. Un documento por entidad: `{ _id: "USERS", seq: 12 }`.
 */
const COUNTERS_COLLECTION = "_counters";

/**
 * Repositorio genérico sobre MongoDB.
 *
 * Ofrece exactamente el mismo contrato que `SqlGenericRepository` y
 * `MemoryGenericRepository` —CRUD, borrado lógico, proyecciones, paginación,
 * auditoría y bitácora—, así que los servicios no notan contra qué motor están
 * corriendo. Lo que cambia respecto a SQL está acotado a tres cosas, y las tres
 * están comentadas donde ocurren: no hay PK autonumérica, no hay una expresión
 * de fecha del servidor, y la transacción se ata a una sesión en vez de a una
 * conexión.
 *
 * Todo nombre de campo sale del mapeo (`EntitySchema`), de modo que ninguna
 * clave arbitraria llega a la consulta.
 */
export class MongoGenericRepository<T extends object, TKey = number>
  implements IGenericRepository<T, TKey>
{
  readonly schema: EntitySchema<T>;

  constructor(
    private readonly db: IMongoDataSource,
    private readonly metadata: EntityMetadata<T>,
    private readonly logger: ILogger,
    /** Provee el usuario de auditoría. Sin él todo se escribe como "System". */
    private readonly context?: IRequestContext,
    /** Bitácora de cambios; sólo actúa si la entidad la tiene activada. */
    private readonly auditTrail?: IAuditTrail,
    /** Sesión de la transacción en curso; fuera de una, cada operación va sola. */
    private readonly session?: ClientSession
  ) {
    this.schema = new EntitySchema(metadata);
  }

  /**
   * Devuelve el mismo repositorio atado a una sesión, que es el equivalente
   * MongoDB de `SqlGenericRepository.withExecutor`. Lo usa la unidad de trabajo.
   */
  withSession(session: ClientSession): MongoGenericRepository<T, TKey> {
    return new MongoGenericRepository<T, TKey>(
      this.db,
      this.metadata,
      this.logger,
      this.context,
      // La bitácora también se ata a la transacción: si ésta revierte, su línea
      // desaparece con ella.
      this.auditTrail?.bindTo(session),
      session
    );
  }

  // ----------------------------------------------------------- auditoría ----

  /** Usuario que queda registrado en las columnas de auditoría. */
  private auditUser(): string {
    return this.context?.getCurrentUserName() ?? SYSTEM_USER;
  }

  /** La bitácora es opt-in por entidad, para no registrar tablas auxiliares. */
  private trailEnabled(): boolean {
    return Boolean(this.auditTrail && this.schema.auditTrail);
  }

  /**
   * Fotografía de quién pide, tomada antes del primer await de la operación.
   * Después ya no es fiable: el driver puede resolver sus callbacks en el
   * contexto en que se creó y no en el de la petición.
   */
  private captureActor(): AuditActor {
    return {
      changedBy: this.auditUser(),
      requestId: this.context?.getRequestId() ?? null,
    };
  }

  private async recordAudit(
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

  // ------------------------------------------------------------- helpers ----

  private collection(): Promise<Collection<Document>> {
    return this.db.collection(this.schema.table);
  }

  private get primaryKeyField(): string {
    return this.schema.columnOf(this.schema.primaryKey);
  }

  /** Filtro por PK, con los valores ya convertidos al formato de la colección. */
  private byId(id: TKey): WhereFilter<T> {
    return { [this.schema.primaryKey]: id } as WhereFilter<T>;
  }

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

  /**
   * Proyección. `_id` se excluye siempre: es la clave técnica de MongoDB, no
   * forma parte del modelo del dominio y no tiene columna equivalente en los
   * otros cuatro motores.
   */
  private projectionOf(select?: Extract<keyof T, string>[]): Document {
    const projection: Document = { _id: 0 };
    for (const property of select ?? []) {
      projection[this.schema.columnOf(property)] = 1;
    }
    return projection;
  }

  /**
   * @param deterministic MongoDB no garantiza el orden natural de una consulta,
   * así que al paginar se cae a la PK cuando no se pidió orden; sin eso, dos
   * páginas consecutivas podrían repetir u omitir documentos.
   */
  private sortOf(
    orderBy: OrderByClause<T> | OrderByClause<T>[] | undefined,
    deterministic: boolean
  ): Document | undefined {
    const clauses = normalizeOrderBy(orderBy);

    if (clauses.length === 0) {
      return deterministic ? { [this.primaryKeyField]: 1 } : undefined;
    }

    const sort: Document = {};
    for (const clause of clauses) {
      sort[this.schema.columnOf(clause.field)] = clause.direction === "desc" ? -1 : 1;
    }
    return sort;
  }

  // -------------------------------------------------------------- lectura ---

  async find(options: QueryOptions<T> = {}): Promise<T[]> {
    const collection = await this.collection();
    const filter = toMongoFilter(
      this.withSoftDeleteFilter(options.where, options.withDeleted),
      this.schema
    );

    const paginated = options.skip !== undefined || options.take !== undefined;
    const documents = await collection
      .find(filter, {
        projection: this.projectionOf(options.select),
        sort: this.sortOf(options.orderBy, paginated),
        skip: options.skip,
        limit: options.take,
        session: this.session,
      })
      .toArray();

    return documents.map((document) => this.schema.toEntity(document as Record<string, unknown>));
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
      where: this.byId(id),
      select: options.select,
      withDeleted: options.withDeleted,
    });
  }

  async count(where?: WhereFilter<T>, withDeleted?: boolean): Promise<number> {
    const collection = await this.collection();
    return collection.countDocuments(
      toMongoFilter(this.withSoftDeleteFilter(where, withDeleted), this.schema),
      { session: this.session }
    );
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

  // ------------------------------------------------------------ secuencia ---

  /** PK más alta que ya existe en la colección; 0 si está vacía. */
  private async highestPrimaryKey(): Promise<number> {
    const collection = await this.collection();
    const [top] = await collection
      .find({}, { projection: { _id: 0, [this.primaryKeyField]: 1 }, sort: { [this.primaryKeyField]: -1 }, limit: 1 })
      .toArray();

    return Number((top as Record<string, unknown> | undefined)?.[this.primaryKeyField] ?? 0);
  }

  /**
   * Reserva `count` PKs consecutivas.
   *
   * MongoDB no tiene IDENTITY ni secuencias, así que se usa el patrón canónico
   * del contador: un `findOneAndUpdate` con `$inc` sobre un documento por
   * entidad, que es atómico y por tanto seguro entre peticiones concurrentes.
   *
   * Dos decisiones que conviene entender:
   *
   * 1. Toda la reserva ocurre **fuera de la sesión** de la transacción, incluida
   *    la lectura de la PK más alta. Por un lado, dos transacciones que tocaran
   *    el mismo documento contador chocarían y una abortaría; por otro, así se
   *    comporta igual que una secuencia de Oracle o un IDENTITY de SQL Server,
   *    que tampoco devuelven el número al hacer rollback: dejar huecos es el
   *    comportamiento esperado.
   *
   * 2. Si el contador acaba de nacer arranca por encima de la PK más alta
   *    existente. El seed de `docker/mongo/init/01-init.js` inserta las PKs 1..4
   *    directamente, sin pasar por aquí, así que un contador que empezara en 1
   *    chocaría de inmediato con una clave ya usada.
   */
  private async nextIds(count: number): Promise<number[]> {
    const counters = await this.db.collection(COUNTERS_COLLECTION);

    const counter = await counters.findOneAndUpdate(
      { _id: this.schema.table as unknown as Document["_id"] },
      { $inc: { seq: count } },
      { upsert: true, returnDocument: "after" }
    );

    let last = Number(counter?.seq ?? count);

    // `last === count` sólo puede darse si el documento se acaba de crear (el
    // upsert lo deja en cero antes de incrementar).
    if (last === count) {
      const highest = await this.highestPrimaryKey();
      if (highest > 0) {
        last = highest + count;
        await counters.updateOne(
          { _id: this.schema.table as unknown as Document["_id"] },
          { $set: { seq: last } }
        );
      }
    }

    return Array.from({ length: count }, (_, index) => last - count + 1 + index);
  }

  // ------------------------------------------------------------ escritura ---

  /**
   * Construye el documento a insertar: propiedad -> campo, valor -> valor de
   * columna, más los automatismos que en SQL pone la propia base.
   */
  private buildInsertDocument(entity: Partial<T>, id: unknown): Record<string, unknown> {
    const { createdAt, updatedAt } = this.schema.timestamps ?? {};
    const { createdBy, updatedBy } = this.schema.audit ?? {};
    const document: Record<string, unknown> = {};

    for (const property of this.schema.insertableProperties()) {
      // La fecha de alta y las columnas de auditoría no salen del cuerpo de la
      // petición: si no, el cliente podría falsear quién y cuándo escribió.
      if (property === createdAt || property === createdBy || property === updatedBy) continue;

      const value = (entity as Record<string, unknown>)[property];
      if (value === undefined) continue;

      document[this.schema.columnOf(property)] = this.schema.toColumnValue(property, value);
    }

    // Se comprueba antes de añadir PK, marcas y estado: si no, una entidad con
    // `createdAt` siempre tendría algún campo y un insert vacío colaría,
    // escribiendo un documento sin datos.
    if (Object.keys(document).length === 0) {
      throw new Error(
        `[MongoGenericRepository] insert en ${this.schema.table} sin campos que escribir.`
      );
    }

    if (id === undefined || id === null) {
      throw new Error(
        `[MongoGenericRepository] ${this.schema.table} no usa identity: la PK es obligatoria.`
      );
    }
    document[this.primaryKeyField] = this.schema.toColumnValue(this.schema.primaryKey, id);

    // Las marcas de tiempo las pone la aplicación con el reloj del proceso:
    // MongoDB no tiene un equivalente de `SYSTIMESTAMP` que el servidor evalúe
    // al escribir, así que no hay forma de delegarlas como en los motores SQL.
    if (createdAt) document[this.schema.columnOf(createdAt)] = new Date();
    if (updatedAt && document[this.schema.columnOf(updatedAt)] === undefined) {
      document[this.schema.columnOf(updatedAt)] = null;
    }

    if (createdBy) document[this.schema.columnOf(createdBy)] = this.auditUser();
    if (updatedBy) document[this.schema.columnOf(updatedBy)] = null;

    // El validador de la colección rechaza documentos, no los completa: el
    // estado inicial del borrado lógico lo escribe el repositorio.
    const softDelete = this.schema.softDelete;
    if (softDelete && document[this.schema.columnOf(softDelete.property)] === undefined) {
      document[this.schema.columnOf(softDelete.property)] = this.schema.softDeleteActiveValue;
    }

    return document;
  }

  async insert(entity: Partial<T>): Promise<T> {
    const actor = this.captureActor();

    const id = this.schema.isIdentity
      ? ((await this.nextIds(1))[0] as unknown as TKey)
      : ((entity as Record<string, unknown>)[this.schema.primaryKey] as TKey);

    const document = this.buildInsertDocument(entity, id);
    const collection = await this.collection();
    await collection.insertOne(document, { session: this.session });

    const created = await this.getById(id, { withDeleted: true });
    if (!created) {
      throw new Error(
        `[MongoGenericRepository] El documento insertado en ${this.schema.table} no se pudo releer (pk=${String(id)}).`
      );
    }

    await this.recordAudit(actor, "INSERT", id, { after: created as Record<string, unknown> });

    this.logger.debug("Documento insertado", { collection: this.schema.table, id });
    return created;
  }

  async insertMany(entities: Partial<T>[]): Promise<number> {
    const actor = this.captureActor();
    if (entities.length === 0) return 0;

    // Las PKs se reservan de una sola vez: un `$inc` por documento multiplicaría
    // los viajes al contador sin ganar nada.
    const ids = this.schema.isIdentity ? await this.nextIds(entities.length) : [];
    const documents = entities.map((entity, index) =>
      this.buildInsertDocument(
        entity,
        this.schema.isIdentity ? ids[index] : (entity as Record<string, unknown>)[this.schema.primaryKey]
      )
    );

    const collection = await this.collection();
    const result = await collection.insertMany(documents, { session: this.session });

    await this.recordAudit(actor, "INSERT_MANY", undefined, { affected: result.insertedCount });

    this.logger.debug("Inserción masiva", {
      collection: this.schema.table,
      affected: result.insertedCount,
    });
    return result.insertedCount;
  }

  /**
   * Construye el `$set` de una actualización. Devuelve `null` si el cambio no
   * toca ningún campo actualizable.
   */
  private buildUpdate(changes: Partial<T>): Record<string, unknown> | null {
    const { updatedAt } = this.schema.timestamps ?? {};
    const { createdBy, updatedBy } = this.schema.audit ?? {};
    const set: Record<string, unknown> = {};

    for (const property of this.schema.updatableProperties()) {
      if (property === updatedAt || property === createdBy || property === updatedBy) continue;

      const value = (changes as Record<string, unknown>)[property];
      if (value === undefined) continue;

      set[this.schema.columnOf(property)] = this.schema.toColumnValue(property, value);
    }

    if (Object.keys(set).length === 0) return null;

    // Misma razón que en el insert: la marca la pone el proceso.
    if (updatedAt) set[this.schema.columnOf(updatedAt)] = new Date();
    if (updatedBy) set[this.schema.columnOf(updatedBy)] = this.auditUser();

    return set;
  }

  async update(id: TKey, changes: Partial<T>): Promise<T | null> {
    const actor = this.captureActor();
    const set = this.buildUpdate(changes);
    // Un update vacío no es un error: simplemente devuelve el estado actual. Si
    // devolviéramos `null` el llamador lo leería como "no existe".
    if (!set) return this.getById(id);

    // El estado previo sólo se lee si hay bitácora: si no, sobra una consulta.
    const before = this.trailEnabled() ? await this.getById(id) : null;

    const collection = await this.collection();
    const result = await collection.updateOne(
      toMongoFilter(this.withSoftDeleteFilter(this.byId(id)), this.schema),
      { $set: set },
      { session: this.session }
    );

    if (result.matchedCount === 0) return null;

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
    const set = this.buildUpdate(changes);
    if (!set) return 0;

    const collection = await this.collection();
    const result = await collection.updateMany(
      toMongoFilter(this.withSoftDeleteFilter(where), this.schema),
      { $set: set },
      { session: this.session }
    );

    // En una operación masiva no se registra documento a documento: la bitácora
    // saldría más cara que la propia operación. Se guarda qué se pidió y a
    // cuántos alcanzó.
    await this.recordAudit(actor, "UPDATE_MANY", undefined, {
      changes: changes as Record<string, unknown>,
      affected: result.matchedCount,
    });

    return result.matchedCount;
  }

  // ---------------------------------------------------------------- borrado -

  private requireSoftDelete(): void {
    if (!this.schema.softDelete) {
      throw new Error(
        `[MongoGenericRepository] La entidad ${this.schema.table} no declara softDelete; ` +
          "usa hardDelete o añade la metadata."
      );
    }
  }

  /** Cambia la marca de borrado lógico y devuelve si afectó a algún documento. */
  private async setSoftDeleteFlag(id: TKey, deleted: boolean): Promise<boolean> {
    this.requireSoftDelete();

    const softDelete = this.schema.softDelete!;
    const set: Record<string, unknown> = {
      [this.schema.columnOf(softDelete.property)]: deleted
        ? this.schema.softDeleteDeletedValue
        : this.schema.softDeleteActiveValue,
    };

    const { updatedAt } = this.schema.timestamps ?? {};
    if (updatedAt) set[this.schema.columnOf(updatedAt)] = new Date();

    // Un borrado lógico es una modificación: debe dejar rastro de quién la hizo.
    const { updatedBy } = this.schema.audit ?? {};
    if (updatedBy) set[this.schema.columnOf(updatedBy)] = this.auditUser();

    // La condición sobre el estado previo hace la operación idempotente: borrar
    // dos veces devuelve `false` la segunda, en vez de fingir que hizo algo.
    const filter = toMongoFilter(
      {
        $and: [
          this.byId(id),
          {
            [softDelete.property]: {
              eq: deleted ? this.schema.softDeleteActiveValue : this.schema.softDeleteDeletedValue,
            },
          } as WhereFilter<T>,
        ],
      } as WhereFilter<T>,
      this.schema
    );

    const collection = await this.collection();
    const result = await collection.updateOne(filter, { $set: set }, { session: this.session });

    return result.matchedCount > 0;
  }

  async softDelete(id: TKey): Promise<boolean> {
    const actor = this.captureActor();
    const deleted = await this.setSoftDeleteFlag(id, true);
    if (deleted) {
      await this.recordAudit(actor, "SOFT_DELETE", id);
      this.logger.warn("Borrado lógico", { collection: this.schema.table, id });
    }
    return deleted;
  }

  async restore(id: TKey): Promise<boolean> {
    const actor = this.captureActor();
    const restored = await this.setSoftDeleteFlag(id, false);
    if (restored) {
      await this.recordAudit(actor, "RESTORE", id);
      this.logger.info("Registro restaurado", { collection: this.schema.table, id });
    }
    return restored;
  }

  async hardDelete(id: TKey): Promise<boolean> {
    const actor = this.captureActor();
    // El documento está a punto de desaparecer: si hay bitácora, se guarda antes.
    const before = this.trailEnabled() ? await this.getById(id, { withDeleted: true }) : null;

    const collection = await this.collection();
    const result = await collection.deleteOne(toMongoFilter(this.byId(id), this.schema), {
      session: this.session,
    });

    const deleted = result.deletedCount > 0;
    if (deleted) {
      await this.recordAudit(actor, "HARD_DELETE", id, {
        before: before as Record<string, unknown> | null,
      });
      this.logger.warn("Borrado físico", { collection: this.schema.table, id });
    }
    return deleted;
  }

  async hardDeleteWhere(where: WhereFilter<T>): Promise<number> {
    const actor = this.captureActor();
    const collection = await this.collection();

    // Sin filtro de borrado lógico: aquí el objetivo es limpiar de verdad, y
    // dejar fuera a los ya marcados dejaría documentos huérfanos apuntando a
    // algo que acaba de desaparecer.
    const result = await collection.deleteMany(toMongoFilter(where, this.schema), {
      session: this.session,
    });

    if (result.deletedCount > 0) {
      await this.recordAudit(actor, "HARD_DELETE_MANY", undefined, {
        affected: result.deletedCount,
      });
      this.logger.warn("Borrado físico masivo", {
        collection: this.schema.table,
        affected: result.deletedCount,
      });
    }
    return result.deletedCount;
  }

  query(): IQueryable<T> {
    return new QueryBuilder<T, TKey>(this);
  }
}
