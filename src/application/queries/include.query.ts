// src/application/queries/include.query.ts
import type {
  IGenericRepository,
  WhereFilter,
} from "../../domain/interfaces/infrastructure/repositories/generic.repository.interface";

/**
 * Equivalente al `Include()` de EF Core para esta arquitectura.
 *
 * Las relaciones entre agregados no se resuelven en el repositorio —cada
 * repositorio conoce una sola tabla— sino aquí, en la capa de aplicación, que es
 * donde viven las reglas de negocio y donde se decide qué hay que traer junto.
 *
 * La carga es *batched*: una sola consulta `WHERE clave IN (...)` por relación,
 * en vez de una por fila, que es justo lo que hace EF al materializar un Include.
 */
export interface IncludeSpec<TParent, TRelated, TKey = number> {
  /** Propiedad del padre que guarda la clave foránea. */
  foreignKey: Extract<keyof TParent, string>;
  /** Propiedad clave de la entidad relacionada. */
  relatedKey: Extract<keyof TRelated, string>;
  repository: IGenericRepository<TRelated, TKey>;
  /**
   * Por defecto `true`: una cita debe seguir mostrando el nombre de su sucursal
   * aunque la sucursal se haya dado de baja lógicamente.
   */
  withDeleted?: boolean;
}

/**
 * Resuelve una relación N:1 y devuelve un índice `clave -> entidad relacionada`.
 * Las claves nulas se ignoran (relación opcional) y no se dispara consulta
 * alguna si no hay nada que resolver.
 */
export async function loadRelated<TParent, TRelated, TKey = number>(
  parents: TParent[],
  spec: IncludeSpec<TParent, TRelated, TKey>
): Promise<Map<unknown, TRelated>> {
  const ids = [
    ...new Set(
      parents
        .map((parent) => (parent as Record<string, unknown>)[spec.foreignKey])
        .filter((id): id is NonNullable<unknown> => id !== null && id !== undefined)
    ),
  ];

  if (ids.length === 0) return new Map();

  const related = await spec.repository.find({
    where: { [spec.relatedKey]: { in: ids } } as WhereFilter<TRelated>,
    withDeleted: spec.withDeleted ?? true,
  });

  return new Map(
    related.map((entity) => [(entity as Record<string, unknown>)[spec.relatedKey], entity])
  );
}
