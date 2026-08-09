// src/infrastructure/repositories/base/memory.generic.repository.ts
import type {
  IGenericRepository,
  IQueryable,
  PagedResult,
  QueryOptions,
  WhereFilter,
} from "../../../domain/interfaces/infrastructure/repositories/generic.repository.interface";
import type { IRequestContext } from "../../../domain/interfaces/infrastructure/plugins/request-context.plugin.interface";
import { SYSTEM_USER } from "../../plugins/asyncRequestContext.plugin";
import { EntityMetadata, EntitySchema } from "./entity-metadata";
import { compareBy, matchesFilter } from "./memory.filter";
import { QueryBuilder } from "./query-builder";
import { normalizeOrderBy } from "./filter.helpers";

/**
 * Misma semántica que `OracleGenericRepository`, pero sobre un array en memoria.
 *
 * Existe para que `DATA_SOURCE=dummy` siga siendo un modo de desarrollo
 * completo: la interfaz web y los tests funcionan sin levantar Docker, y el
 * código de servicios/controladores es exactamente el mismo que contra Oracle.
 */
/** Copia del estado interno; la usa la unidad de trabajo para revertir. */
export interface MemorySnapshot<T> {
  rows: T[];
  sequence: number;
}

export class MemoryGenericRepository<T extends object, TKey = number>
  implements IGenericRepository<T, TKey>
{
  readonly schema: EntitySchema<T>;
  private readonly store: T[];
  private sequence = 0;

  constructor(
    metadata: EntityMetadata<T>,
    seed: Partial<T>[] = [],
    /** Provee el usuario de auditoría. Sin él todo se escribe como "System". */
    private readonly context?: IRequestContext
  ) {
    this.schema = new EntitySchema(metadata);
    this.store = [];
    for (const entity of seed) {
      this.insertSync(entity);
    }
  }

  /** Usuario que queda registrado en las columnas de auditoría. */
  private auditUser(): string {
    return this.context?.getCurrentUserName() ?? SYSTEM_USER;
  }

  // ------------------------------------------------------------ helpers ----

  /** Copia defensiva: quien lee no debe poder mutar el almacén. */
  private clone(entity: T, select?: Extract<keyof T, string>[]): T {
    if (!select?.length) return { ...entity };

    const projected: Record<string, unknown> = {};
    for (const property of select) {
      // Valida la propiedad igual que haría el SELECT generado para Oracle.
      this.schema.columnOf(property);
      projected[property] = (entity as Record<string, unknown>)[property];
    }
    return projected as T;
  }

  private isActive(entity: T): boolean {
    const softDelete = this.schema.softDelete;
    if (!softDelete) return true;

    const value = (entity as Record<string, unknown>)[softDelete.property];
    const active = this.schema.softDeleteActiveValue;
    // El modelo guarda booleanos; la metadata expresa el valor en términos de la
    // columna (1/0). Se comparan normalizados.
    return this.schema.toColumnValue(softDelete.property, value) === (active ? 1 : 0);
  }

  private applyFilters(options: QueryOptions<T>): T[] {
    let rows = this.store.filter((entity) => matchesFilter(entity, options.where, this.schema));

    if (!options.withDeleted) {
      rows = rows.filter((entity) => this.isActive(entity));
    }

    const orderBy = normalizeOrderBy(options.orderBy);
    if (orderBy.length > 0) {
      rows = [...rows].sort((left, right) => {
        for (const clause of orderBy) {
          // Valida la propiedad antes de ordenar por ella.
          this.schema.columnOf(clause.field);
          const result = compareBy(
            (left as Record<string, unknown>)[clause.field],
            (right as Record<string, unknown>)[clause.field],
            clause.direction
          );
          if (result !== 0) return result;
        }
        return 0;
      });
    }

    return rows;
  }

  private findEntity(id: TKey): T | undefined {
    return this.store.find(
      (entity) => (entity as Record<string, unknown>)[this.schema.primaryKey] === id
    );
  }

  // -------------------------------------------------------------- lectura ---

  async find(options: QueryOptions<T> = {}): Promise<T[]> {
    let rows = this.applyFilters(options);

    const skip = options.skip ?? 0;
    if (skip > 0) rows = rows.slice(skip);
    if (options.take !== undefined) rows = rows.slice(0, options.take);

    return rows.map((entity) => this.clone(entity, options.select));
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
    return this.applyFilters({ where, withDeleted }).length;
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

    const rows = this.applyFilters(options);
    const items = rows
      .slice((safePage - 1) * safeLimit, (safePage - 1) * safeLimit + safeLimit)
      .map((entity) => this.clone(entity, options.select));

    return {
      items,
      total: rows.length,
      page: safePage,
      limit: safeLimit,
      pages: Math.ceil(rows.length / safeLimit),
    };
  }

  // ------------------------------------------------------------- escritura --

  /** Versión síncrona usada también para cargar el seed en el constructor. */
  private insertSync(entity: Partial<T>): T {
    const record: Record<string, unknown> = {};
    const { createdBy, updatedBy } = this.schema.audit ?? {};

    for (const property of this.schema.properties) {
      // La auditoría sale del contexto, nunca del cuerpo de la petición.
      if (property === createdBy || property === updatedBy) continue;

      const value = (entity as Record<string, unknown>)[property];
      if (value !== undefined) record[property] = value;
    }

    // Mismo criterio que en Oracle: se comprueba antes de añadir PK, estado y
    // marcas de tiempo, para que un insert sin datos no cuele.
    if (Object.keys(record).length === 0) {
      throw new Error(
        `[MemoryGenericRepository] insert en ${this.schema.table} sin columnas que escribir.`
      );
    }

    if (this.schema.isIdentity) {
      this.sequence += 1;
      record[this.schema.primaryKey] = this.sequence;
    } else {
      const provided = record[this.schema.primaryKey];
      if (provided === undefined) {
        throw new Error(
          `[MemoryGenericRepository] ${this.schema.table} no usa identity: la PK es obligatoria.`
        );
      }
    }

    const softDelete = this.schema.softDelete;
    if (softDelete && record[softDelete.property] === undefined) {
      record[softDelete.property] = true;
    }

    const { createdAt, updatedAt } = this.schema.timestamps ?? {};
    if (createdAt) record[createdAt] = new Date();
    if (updatedAt && record[updatedAt] === undefined) record[updatedAt] = null;

    if (createdBy) record[createdBy] = this.auditUser();
    if (updatedBy) record[updatedBy] = null;

    const stored = record as T;
    this.store.push(stored);
    return stored;
  }

  async insert(entity: Partial<T>): Promise<T> {
    return this.clone(this.insertSync(entity));
  }

  async insertMany(entities: Partial<T>[]): Promise<number> {
    entities.forEach((entity) => this.insertSync(entity));
    return entities.length;
  }

  /** Aplica los cambios sobre el registro almacenado; devuelve si tocó algo. */
  private applyChanges(entity: T, changes: Partial<T>): boolean {
    const { updatedAt } = this.schema.timestamps ?? {};
    const { createdBy, updatedBy } = this.schema.audit ?? {};
    const record = entity as Record<string, unknown>;
    let touched = false;

    for (const property of this.schema.updatableProperties()) {
      if (property === updatedAt || property === createdBy || property === updatedBy) continue;

      const value = (changes as Record<string, unknown>)[property];
      if (value === undefined) continue;

      record[property] = value;
      touched = true;
    }

    if (touched && updatedAt) record[updatedAt] = new Date();
    if (touched && updatedBy) record[updatedBy] = this.auditUser();
    return touched;
  }

  async update(id: TKey, changes: Partial<T>): Promise<T | null> {
    const entity = this.findEntity(id);
    if (!entity || !this.isActive(entity)) return null;

    this.applyChanges(entity, changes);
    return this.clone(entity);
  }

  async updateWhere(where: WhereFilter<T>, changes: Partial<T>): Promise<number> {
    const targets = this.applyFilters({ where });
    let affected = 0;

    for (const entity of targets) {
      if (this.applyChanges(entity, changes)) affected += 1;
    }

    return affected;
  }

  // ---------------------------------------------------------------- borrado -

  private setSoftDeleteFlag(id: TKey, deleted: boolean): boolean {
    const softDelete = this.schema.softDelete;
    if (!softDelete) {
      throw new Error(
        `[MemoryGenericRepository] La entidad ${this.schema.table} no declara softDelete; ` +
          "usa hardDelete o añade la metadata."
      );
    }

    const entity = this.findEntity(id);
    if (!entity) return false;
    // Idempotente: borrar dos veces devuelve `false` la segunda vez.
    if (this.isActive(entity) === !deleted) return false;

    const record = entity as Record<string, unknown>;
    record[softDelete.property] = !deleted;

    const { updatedAt } = this.schema.timestamps ?? {};
    if (updatedAt) record[updatedAt] = new Date();

    // Un borrado lógico es una modificación: debe dejar rastro de quién la hizo.
    const { updatedBy } = this.schema.audit ?? {};
    if (updatedBy) record[updatedBy] = this.auditUser();

    return true;
  }

  async softDelete(id: TKey): Promise<boolean> {
    return this.setSoftDeleteFlag(id, true);
  }

  async restore(id: TKey): Promise<boolean> {
    return this.setSoftDeleteFlag(id, false);
  }

  async hardDelete(id: TKey): Promise<boolean> {
    const index = this.store.findIndex(
      (entity) => (entity as Record<string, unknown>)[this.schema.primaryKey] === id
    );
    if (index === -1) return false;

    this.store.splice(index, 1);
    return true;
  }

  async hardDeleteWhere(where: WhereFilter<T>): Promise<number> {
    // `withDeleted` para alcanzar también a los borrados lógicamente.
    const targets = new Set(this.applyFilters({ where, withDeleted: true }));
    if (targets.size === 0) return 0;

    const survivors = this.store.filter((entity) => !targets.has(entity));
    const removed = this.store.length - survivors.length;
    this.store.splice(0, this.store.length, ...survivors);
    return removed;
  }

  query(): IQueryable<T> {
    return new QueryBuilder<T, TKey>(this);
  }

  // ------------------------------------------------------ unidad de trabajo -

  /**
   * Fotografía del almacén. En memoria no hay transacciones reales, así que la
   * forma de emular el rollback es guardar el estado antes de empezar.
   */
  snapshot(): MemorySnapshot<T> {
    return {
      rows: this.store.map((entity) => ({ ...entity })),
      sequence: this.sequence,
    };
  }

  /** Restaura una fotografía previa, descartando lo escrito desde entonces. */
  restoreSnapshot(state: MemorySnapshot<T>): void {
    // `splice` en vez de reasignar: `store` es readonly y otras referencias al
    // array deben ver el estado restaurado.
    this.store.splice(0, this.store.length, ...state.rows.map((entity) => ({ ...entity })));
    this.sequence = state.sequence;
  }
}
