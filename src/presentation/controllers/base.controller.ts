// src/presentation/controllers/base.controller.ts
import type {
  CurrentUser,
  IRequestContext,
} from "../../domain/interfaces/infrastructure/plugins/request-context.plugin.interface";
import { AppError } from "../../core/errors/app-error";

/**
 * Base de los controladores: expone la identidad de la petición sin que cada
 * uno tenga que leer el token ni recibir el contexto por parámetro.
 *
 * Es el equivalente de `BaseApiController` en .NET, que publica los claims a
 * sus controladores. La diferencia es de dónde salen: allá de
 * `HttpContext.User`, aquí del contexto que abre el middleware y rellena el
 * guard de JWT (ver `requestContext.middleware.ts`).
 */
export abstract class BaseController {
  protected constructor(protected readonly context: IRequestContext) {}

  /** Usuario autenticado, o `null` si la ruta es anónima. */
  protected get currentUser(): CurrentUser | null {
    return this.context.getCurrentUser();
  }

  /**
   * Id del usuario (claim `sub`). Es lo que deben usar las reglas que dependen
   * de quién pide: el nombre puede cambiar, el id no.
   */
  protected get userId(): string | null {
    return this.context.getCurrentUserId();
  }

  /** Nombre para mostrar o registrar; `"System"` fuera de una petición. */
  protected get userName(): string {
    return this.context.getCurrentUserName();
  }

  protected get userEmail(): string | null {
    return this.currentUser?.email ?? null;
  }

  /** Id de correlación de la petición; también viaja en `X-Request-Id`. */
  protected get requestId(): string | undefined {
    return this.context.getRequestId();
  }

  /**
   * Id del usuario exigiendo que exista. Para acciones que no tienen sentido
   * sin identidad: falla con 401 en vez de continuar con `null`.
   */
  protected requireUserId(): string {
    const id = this.userId;
    if (!id) {
      throw new AppError("No authenticated user in the request", 401, true, {
        code: "NO_AUTHENTICATED_USER",
      });
    }
    return id;
  }
}
