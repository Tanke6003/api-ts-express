// src/domain/interfaces/infrastructure/repositories/generic.repository.interface.ts

/**
 * Contrato genérico de acceso a datos, en la línea de lo que ofrecen EF Core o
 * LINQ: un CRUD clásico (getAll / getById / insert / update / delete lógico y
 * físico) más un pequeño lenguaje de consulta declarativo que cada driver
 * traduce a lo suyo (SQL para Oracle, filtrado en memoria para el modo dummy).
 *
 * La gracia es que un módulo nuevo no vuelve a escribir SQL: describe su tabla
 * con `EntityMetadata` y recibe todo esto gratis.
 */

export type SortDirection = "asc" | "desc";

/**
 * Operadores de comparación soportados por el filtro. Se traducen 1:1 a SQL:
 * `{ gte: 18 }` -> `COL >= :bind`.
 */
export interface FieldOperators<V> {
  eq?: V;
  ne?: V;
  gt?: V;
  gte?: V;
  lt?: V;
  lte?: V;
  /** LIKE de SQL; el patrón (`%`, `_`) lo escribe quien llama. */
  like?: string;
  notLike?: string;
  /** LIKE ignorando mayúsculas/minúsculas (`UPPER(col) LIKE UPPER(:bind)`). */
  ilike?: string;
  /**
   * Contiene este **texto literal**, sin distinguir mayúsculas.
   *
   * Es el operador para buscar con lo que teclea un usuario. `like` e `ilike`
   * reciben un patrón, así que un `%` o un `_` que venga del formulario se
   * interpretan como comodines: buscar `%` devuelve la tabla entera y `a_b`
   * casa con `axb`. Aquí no hay patrón que escribir, y cada driver lo resuelve
   * a su manera —LIKE con ESCAPE, `includes`, `$regex` escapado—, así que quien
   * llama no puede equivocarse.
   */
  contains?: string;
  in?: V[];
  notIn?: V[];
  between?: [V, V];
  /** `true` -> IS NULL, `false` -> IS NOT NULL. */
  isNull?: boolean;
}

/**
 * Valor directo (`{ name: "Ana" }`, azúcar para `eq`), `null` (IS NULL) o un
 * objeto de operadores.
 */
export type FieldFilter<V> = V | null | FieldOperators<V>;

/**
 * Filtro compuesto. Las claves de la entidad se combinan con AND; `$and`, `$or`
 * y `$not` permiten anidar grupos arbitrarios.
 */
export type WhereFilter<T> = {
  [K in keyof T]?: FieldFilter<T[K]>;
} & {
  $and?: WhereFilter<T>[];
  $or?: WhereFilter<T>[];
  $not?: WhereFilter<T>;
};

export interface OrderByClause<T> {
  field: Extract<keyof T, string>;
  direction?: SortDirection;
}

export interface QueryOptions<T> {
  where?: WhereFilter<T>;
  orderBy?: OrderByClause<T> | OrderByClause<T>[];
  /** Registros a saltar (OFFSET). */
  skip?: number;
  /** Máximo de registros a devolver (FETCH NEXT). */
  take?: number;
  /** Proyección; si se omite se devuelven todas las columnas mapeadas. */
  select?: Extract<keyof T, string>[];
  /**
   * Por defecto las lecturas excluyen los registros con borrado lógico.
   * Ponlo en `true` para incluirlos (equivalente a `IgnoreQueryFilters()`).
   */
  withDeleted?: boolean;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

/**
 * Consulta encadenable, al estilo `IQueryable<T>` de LINQ. Es perezosa: no toca
 * la base hasta que se llama a un método terminal (`toList`, `count`, ...).
 */
export interface IQueryable<T> {
  /** Acumulativo: varias llamadas se combinan con AND. */
  where(filter: WhereFilter<T>): IQueryable<T>;
  orderBy(field: Extract<keyof T, string>, direction?: SortDirection): IQueryable<T>;
  orderByDescending(field: Extract<keyof T, string>): IQueryable<T>;
  select(...fields: Extract<keyof T, string>[]): IQueryable<T>;
  skip(count: number): IQueryable<T>;
  take(count: number): IQueryable<T>;
  withDeleted(): IQueryable<T>;

  // ----- Operadores terminales -----
  toList(): Promise<T[]>;
  firstOrDefault(): Promise<T | null>;
  count(): Promise<number>;
  any(): Promise<boolean>;
  toPagedList(page: number, limit: number): Promise<PagedResult<T>>;

  /** Devuelve las opciones acumuladas (útil para depurar o reutilizar). */
  toOptions(): QueryOptions<T>;
}

export interface IGenericRepository<T, TKey = number> {
  getAll(options?: QueryOptions<T>): Promise<T[]>;
  getPaged(
    page: number,
    limit: number,
    options?: Omit<QueryOptions<T>, "skip" | "take">
  ): Promise<PagedResult<T>>;
  getById(
    id: TKey,
    options?: Pick<QueryOptions<T>, "select" | "withDeleted">
  ): Promise<T | null>;
  find(options: QueryOptions<T>): Promise<T[]>;
  firstOrDefault(options?: QueryOptions<T>): Promise<T | null>;
  count(where?: WhereFilter<T>, withDeleted?: boolean): Promise<number>;
  exists(where: WhereFilter<T>, withDeleted?: boolean): Promise<boolean>;

  /** Inserta y devuelve la entidad ya persistida (con la PK generada). */
  insert(entity: Partial<T>): Promise<T>;
  /** Inserción masiva; devuelve cuántas filas se escribieron. */
  insertMany(entities: Partial<T>[]): Promise<number>;
  /** Actualiza por PK y devuelve la entidad resultante, o `null` si no existía. */
  update(id: TKey, changes: Partial<T>): Promise<T | null>;
  /** Actualiza todo lo que case con el filtro; devuelve filas afectadas. */
  updateWhere(where: WhereFilter<T>, changes: Partial<T>): Promise<number>;

  /** Borrado lógico: marca la columna de soft-delete. */
  softDelete(id: TKey): Promise<boolean>;
  /** Revierte un borrado lógico. */
  restore(id: TKey): Promise<boolean>;
  /** Borrado físico: DELETE real. */
  hardDelete(id: TKey): Promise<boolean>;
  /**
   * Borrado físico masivo; devuelve filas borradas. A diferencia de las
   * lecturas, alcanza también a los registros con borrado lógico: si no lo
   * hiciera, dejaría filas huérfanas apuntando por clave foránea a algo ya
   * borrado.
   */
  hardDeleteWhere(where: WhereFilter<T>): Promise<number>;

  /** Punto de entrada al API encadenable. */
  query(): IQueryable<T>;
}
