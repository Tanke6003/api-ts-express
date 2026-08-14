// src/domain/interfaces/infrastructure/repositories/unit-of-work.interface.ts
import { IGenericRepository } from "./generic.repository.interface";

/**
 * Unidad de trabajo.
 *
 * Criterio del proyecto: **no** se abre una transacción por operación. Una única
 * sentencia (el CRUD del repositorio genérico) ya es atómica y viaja con
 * auto-commit; envolverla sólo añadiría ida y vuelta a la base.
 *
 * La transacción se abre en dos casos, y el límite lo pone el servicio, no el
 * repositorio:
 *
 * 1. **Se escribe en más de un sitio** y el resultado a medias sería inválido:
 *    dar de baja una sucursal y cancelar sus citas, o borrar físicamente una
 *    sucursal cuyas citas la referencian por clave foránea.
 *
 * 2. **Se decide en función de lo que se acaba de leer**, aunque luego se
 *    escriba una sola fila. Es el caso del alta de una cita: comprobar que el
 *    hueco está libre y ocuparlo son dos sentencias, y entre una y otra cabe
 *    otra petición haciendo lo mismo. Aquí la transacción no está por la
 *    atomicidad sino por el aislamiento, y va acompañada de `lockRow`.
 *
 * Lo que sigue sin justificar una transacción es envolver una única sentencia
 * que no depende de ninguna lectura: ya es atómica y viaja con auto-commit.
 */
export interface ITransactionScope {
  /**
   * Repositorio genérico de una entidad, enlazado a la transacción en curso.
   * Todo lo que se escriba con él entra en el mismo commit.
   *
   * @param entity Nombre lógico de la entidad (ver `ENTITY_NAMES`).
   */
  repository<T extends object, TKey = number>(entity: string): IGenericRepository<T, TKey>;

  /**
   * Bloquea una fila hasta el commit. Las transacciones que pidan la misma fila
   * esperan aquí, en cola.
   *
   * Es lo que hace falta cuando la decisión de escribir depende de lo que se
   * acaba de leer: sin bloqueo, dos peticiones simultáneas leen el mismo estado,
   * las dos concluyen que pueden escribir y las dos escriben. Bloquear la fila
   * *padre* —la sucursal de una cita, no la cita— serializa sólo a quienes
   * compiten de verdad y deja pasar en paralelo al resto.
   *
   * **Tiene que ser la primera sentencia de la transacción.** En MySQL, que por
   * defecto es REPEATABLE READ, la instantánea se fija en la primera lectura
   * consistente; si antes del bloqueo ya hubo un SELECT normal, las lecturas
   * posteriores seguirían viendo el estado viejo aunque el bloqueo se conceda.
   * Una lectura de bloqueo no fija instantánea, así que abriendo con ella las
   * comprobaciones ven lo último confirmado en los cuatro motores.
   *
   * @param entity Nombre lógico de la entidad (ver `ENTITY_NAMES`).
   * @param id Clave primaria de la fila.
   * @returns `false` si la fila no existe, que también es una respuesta útil.
   */
  lockRow(entity: string, id: unknown): Promise<boolean>;
}

export interface IUnitOfWork {
  /**
   * Ejecuta `work` de forma atómica: commit si termina bien, rollback si lanza.
   * El error original se propaga tal cual, para que el servicio decida.
   */
  execute<R>(work: (scope: ITransactionScope) => Promise<R>): Promise<R>;
}
