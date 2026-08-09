// src/infrastructure/repositories/base/query-builder.ts
import type {
  IGenericRepository,
  IQueryable,
  PagedResult,
  QueryOptions,
  SortDirection,
  WhereFilter,
} from "../../../domain/interfaces/infrastructure/repositories/generic.repository.interface";
import { normalizeOrderBy } from "./filter.helpers";

/**
 * Implementación de `IQueryable<T>` compartida por todos los drivers: no sabe
 * nada de SQL ni de memoria, sólo acumula `QueryOptions` y delega los métodos
 * terminales en el repositorio que la creó.
 *
 * Es inmutable, como `IQueryable` en LINQ: cada operador devuelve una instancia
 * nueva, así que una consulta base se puede derivar en varias sin que se
 * contaminen entre sí.
 */
export class QueryBuilder<T, TKey = number> implements IQueryable<T> {
  constructor(
    private readonly repository: IGenericRepository<T, TKey>,
    private readonly options: QueryOptions<T> = {}
  ) {}

  private derive(patch: Partial<QueryOptions<T>>): QueryBuilder<T, TKey> {
    return new QueryBuilder<T, TKey>(this.repository, { ...this.options, ...patch });
  }

  where(filter: WhereFilter<T>): IQueryable<T> {
    // Varios `where` encadenados se combinan con AND, como en LINQ.
    const merged: WhereFilter<T> = this.options.where
      ? ({ $and: [this.options.where, filter] } as WhereFilter<T>)
      : filter;
    return this.derive({ where: merged });
  }

  orderBy(field: Extract<keyof T, string>, direction: SortDirection = "asc"): IQueryable<T> {
    return this.derive({
      orderBy: [...normalizeOrderBy(this.options.orderBy), { field, direction }],
    });
  }

  orderByDescending(field: Extract<keyof T, string>): IQueryable<T> {
    return this.orderBy(field, "desc");
  }

  select(...fields: Extract<keyof T, string>[]): IQueryable<T> {
    return this.derive({ select: fields });
  }

  skip(count: number): IQueryable<T> {
    return this.derive({ skip: count });
  }

  take(count: number): IQueryable<T> {
    return this.derive({ take: count });
  }

  withDeleted(): IQueryable<T> {
    return this.derive({ withDeleted: true });
  }

  // ------------------------------------------------- operadores terminales ---

  toList(): Promise<T[]> {
    return this.repository.find(this.options);
  }

  firstOrDefault(): Promise<T | null> {
    return this.repository.firstOrDefault(this.options);
  }

  count(): Promise<number> {
    return this.repository.count(this.options.where, this.options.withDeleted);
  }

  async any(): Promise<boolean> {
    return (await this.count()) > 0;
  }

  toPagedList(page: number, limit: number): Promise<PagedResult<T>> {
    // `skip`/`take` los fija la paginación, por eso no se propagan aquí.
    const { where, orderBy, select, withDeleted } = this.options;
    return this.repository.getPaged(page, limit, { where, orderBy, select, withDeleted });
  }

  toOptions(): QueryOptions<T> {
    return { ...this.options };
  }
}
