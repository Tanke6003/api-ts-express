// src/infrastructure/repositories/base/module.repository.ts
import type {
  IGenericRepository,
  IQueryable,
  PagedResult,
  QueryOptions,
  WhereFilter,
} from "../../../domain/interfaces/infrastructure/repositories/generic.repository.interface";
import type { ILogger } from "../../../domain/interfaces/infrastructure/plugins/logger.plugin.interface";
import { QueryBuilder } from "./query/query-builder";

/**
 * Repositorio de módulo: envuelve al repositorio genérico del driver activo y
 * le añade lo que el proyecto espera de esta capa —registro de errores y un
 * mensaje estable hacia arriba— sin repetir el try/catch en cada método.
 *
 * Un módulo concreto sólo extiende esta clase y añade, si acaso, sus consultas
 * propias. Las relaciones entre agregados no se resuelven aquí: eso es regla de
 * negocio y vive en los servicios (ver `loadRelated`).
 */
export abstract class BaseModuleRepository<T extends object, TKey = number>
  implements IGenericRepository<T, TKey>
{
  protected constructor(
    protected readonly store: IGenericRepository<T, TKey>,
    protected readonly logger: ILogger,
    /** Nombre del repositorio concreto; aparece en los logs y en los errores. */
    protected readonly context: string
  ) {}

  /**
   * Ejecuta una operación del almacén traduciendo cualquier fallo a un error
   * genérico: los detalles del driver quedan en el log, no en la respuesta HTTP.
   */
  protected async guard<R>(operation: string, work: () => Promise<R>, meta?: object): Promise<R> {
    try {
      return await work();
    } catch (error) {
      this.logger.error(`Error in ${this.context}.${operation}`, { ...meta, error });
      // El error original viaja en `cause`: hacia el cliente sale un mensaje
      // neutro, pero el manejador global puede seguir reconociendo un ORA-00001
      // y responder 409 en vez de un 500 genérico.
      throw new Error(`${this.context}.${operation} failed.`, { cause: error });
    }
  }

  getAll(options?: QueryOptions<T>): Promise<T[]> {
    return this.guard("getAll", () => this.store.getAll(options));
  }

  getPaged(
    page: number,
    limit: number,
    options?: Omit<QueryOptions<T>, "skip" | "take">
  ): Promise<PagedResult<T>> {
    return this.guard("getPaged", () => this.store.getPaged(page, limit, options), { page, limit });
  }

  getById(id: TKey, options?: Pick<QueryOptions<T>, "select" | "withDeleted">): Promise<T | null> {
    return this.guard("getById", () => this.store.getById(id, options), { id });
  }

  find(options: QueryOptions<T>): Promise<T[]> {
    return this.guard("find", () => this.store.find(options));
  }

  firstOrDefault(options?: QueryOptions<T>): Promise<T | null> {
    return this.guard("firstOrDefault", () => this.store.firstOrDefault(options));
  }

  count(where?: WhereFilter<T>, withDeleted?: boolean): Promise<number> {
    return this.guard("count", () => this.store.count(where, withDeleted));
  }

  exists(where: WhereFilter<T>, withDeleted?: boolean): Promise<boolean> {
    return this.guard("exists", () => this.store.exists(where, withDeleted));
  }

  insert(entity: Partial<T>): Promise<T> {
    return this.guard("insert", () => this.store.insert(entity), { entity });
  }

  insertMany(entities: Partial<T>[]): Promise<number> {
    return this.guard("insertMany", () => this.store.insertMany(entities), {
      batch: entities.length,
    });
  }

  update(id: TKey, changes: Partial<T>): Promise<T | null> {
    return this.guard("update", () => this.store.update(id, changes), { id, changes });
  }

  updateWhere(where: WhereFilter<T>, changes: Partial<T>): Promise<number> {
    return this.guard("updateWhere", () => this.store.updateWhere(where, changes), { changes });
  }

  softDelete(id: TKey): Promise<boolean> {
    return this.guard("softDelete", () => this.store.softDelete(id), { id });
  }

  restore(id: TKey): Promise<boolean> {
    return this.guard("restore", () => this.store.restore(id), { id });
  }

  hardDelete(id: TKey): Promise<boolean> {
    return this.guard("hardDelete", () => this.store.hardDelete(id), { id });
  }

  hardDeleteWhere(where: WhereFilter<T>): Promise<number> {
    return this.guard("hardDeleteWhere", () => this.store.hardDeleteWhere(where));
  }

  /**
   * El builder apunta a `this`, no al almacén: así los operadores terminales
   * (`toList`, `count`, ...) también pasan por `guard`.
   */
  query(): IQueryable<T> {
    return new QueryBuilder<T, TKey>(this);
  }
}
