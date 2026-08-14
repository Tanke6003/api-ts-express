// src/domain/interfaces/infrastructure/repositories/unit-of-work.interface.ts
import { IGenericRepository } from "./generic.repository.interface";

/**
 * Unidad de trabajo.
 *
 * Criterio del proyecto: **no** se abre una transacción por operación. Una única
 * sentencia (el CRUD del repositorio genérico) ya es atómica y viaja con
 * auto-commit; envolverla sólo añadiría ida y vuelta a la base.
 *
 * La transacción se abre cuando un caso de uso escribe en más de un sitio y el
 * resultado a medias sería inválido —por ejemplo, dar de baja una sucursal y
 * cancelar sus citas, o borrar físicamente una sucursal cuyas citas la
 * referencian por clave foránea—. Ese límite es el servicio, no el repositorio.
 */
export interface ITransactionScope {
  /**
   * Repositorio genérico de una entidad, enlazado a la transacción en curso.
   * Todo lo que se escriba con él entra en el mismo commit.
   *
   * @param entity Nombre lógico de la entidad (ver `ENTITY_NAMES`).
   */
  repository<T extends object, TKey = number>(entity: string): IGenericRepository<T, TKey>;
}

export interface IUnitOfWork {
  /**
   * Ejecuta `work` de forma atómica: commit si termina bien, rollback si lanza.
   * El error original se propaga tal cual, para que el servicio decida.
   */
  execute<R>(work: (scope: ITransactionScope) => Promise<R>): Promise<R>;
}
