// src/domain/interfaces/infrastructure/plugins/transaction-context.plugin.interface.ts
import type { ITransactionScope } from "../repositories/unit-of-work.interface";

/**
 * Transacción en curso, accesible desde donde haga falta sin pasarla por
 * parámetro.
 *
 * Sin esto, abrir una transacción obliga a arrastrar el ámbito hacia abajo: un
 * método de servicio que sólo necesitaba un id acaba recibiendo también el
 * repositorio, porque dentro de la transacción hay que usar el del ámbito y
 * fuera el inyectado. Con el contexto, el repositorio de módulo mira si hay una
 * transacción abierta y se apunta a ella él solo.
 *
 * Es la misma técnica que `IRequestContext` usa para la identidad de la
 * petición —`AsyncLocalStorage`—, y por el mismo motivo: el almacén sobrevive a
 * los `await`, así que una llamada tres capas más abajo sigue viendo la
 * transacción, y dos peticiones concurrentes no se pisan.
 */
export interface ITransactionContext {
  /** Ejecuta `fn` con `scope` como transacción activa. */
  run<T>(scope: ITransactionScope, fn: () => Promise<T>): Promise<T>;

  /** Transacción activa, o `undefined` fuera de una. */
  current(): ITransactionScope | undefined;
}
