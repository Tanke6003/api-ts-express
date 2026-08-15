// src/infrastructure/plugins/asyncTransactionContext.plugin.ts
import { AsyncLocalStorage } from "node:async_hooks";
import type { ITransactionContext } from "../../domain/interfaces/infrastructure/plugins/transaction-context.plugin.interface";
import type { ITransactionScope } from "../../domain/interfaces/infrastructure/repositories/unit-of-work.interface";

/**
 * Transacción en curso sobre `AsyncLocalStorage`.
 *
 * Gemelo de `AsyncRequestContextPlugin`: una variable de módulo no serviría
 * porque dos peticiones concurrentes se pisarían, y el almacén de ALS sí
 * sobrevive a los `await` y es propio de cada cadena de llamadas.
 *
 * Anidar reemplaza: si dentro de una transacción se abriera otra, la interior
 * sería la activa mientras dure y al salir vuelve la de fuera. Hoy ningún
 * servicio anida —y en memoria la unidad de trabajo lo impediría, porque
 * serializa—, pero es el comportamiento correcto si alguna vez ocurre.
 */
export class AsyncTransactionContextPlugin implements ITransactionContext {
  private readonly storage = new AsyncLocalStorage<ITransactionScope>();

  run<T>(scope: ITransactionScope, fn: () => Promise<T>): Promise<T> {
    return this.storage.run(scope, fn);
  }

  current(): ITransactionScope | undefined {
    return this.storage.getStore();
  }
}
