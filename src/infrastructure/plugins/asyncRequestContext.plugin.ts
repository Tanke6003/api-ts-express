// src/infrastructure/plugins/asyncRequestContext.plugin.ts
import { AsyncLocalStorage } from "node:async_hooks";
import type {
  CurrentUser,
  IRequestContext,
  RequestContextData,
} from "../../domain/interfaces/infrastructure/plugins/request-context.plugin.interface";

/** Valor de auditoría cuando no hay usuario: procesos internos, seeds, arranque. */
export const SYSTEM_USER = "System";

/**
 * Contexto de petición sobre `AsyncLocalStorage`.
 *
 * Es el equivalente en Node de `IHttpContextAccessor`: el almacén sobrevive a
 * los `await`, así que un repositorio invocado tres capas más abajo sigue viendo
 * el usuario de la petición sin recibirlo por parámetro. Una variable de módulo
 * normal no serviría: dos peticiones concurrentes se pisarían.
 */
export class AsyncRequestContextPlugin implements IRequestContext {
  private readonly storage = new AsyncLocalStorage<RequestContextData>();

  run<T>(data: RequestContextData, fn: () => T): T {
    return this.storage.run(data, fn);
  }

  get(): RequestContextData | undefined {
    return this.storage.getStore();
  }

  getCurrentUser(): CurrentUser | null {
    return this.storage.getStore()?.user ?? null;
  }

  getCurrentUserName(): string {
    return this.storage.getStore()?.user?.name ?? SYSTEM_USER;
  }

  getCurrentUserId(): string | null {
    return this.storage.getStore()?.user?.id ?? null;
  }

  getRequestId(): string | undefined {
    return this.storage.getStore()?.requestId;
  }
}
