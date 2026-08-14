// src/domain/interfaces/infrastructure/plugins/request-context.plugin.interface.ts

/**
 * Identidad del usuario que hizo la petición, extraída del token.
 * `name` es lo que se escribe en las columnas de auditoría.
 */
export interface CurrentUser {
  id: string | null;
  name: string;
  email: string | null;
}

export interface RequestContextData {
  /** Identificador de la petición; viaja en el log y en la respuesta de error. */
  requestId: string;
  user: CurrentUser | null;
}

/**
 * Contexto de la petición en curso, accesible desde cualquier capa sin pasarlo
 * como parámetro. Es el equivalente de `IHttpContextAccessor` en .NET.
 *
 * Lo necesita el repositorio genérico para rellenar `CREATED_BY` / `UPDATED_BY`
 * sin que los servicios tengan que arrastrar el usuario hasta el CRUD.
 */
export interface IRequestContext {
  /** Ejecuta `fn` con este contexto activo, incluido todo lo asíncrono que lance. */
  run<T>(data: RequestContextData, fn: () => T): T;

  get(): RequestContextData | undefined;
  getCurrentUser(): CurrentUser | null;

  /**
   * Nombre para auditoría. Devuelve `"System"` cuando no hay petición en curso
   * (arranque, tareas programadas, seeds), igual que hace `BaseBll` en .NET.
   */
  getCurrentUserName(): string;

  /**
   * Id del usuario autenticado (claim `sub`), o `null` si la petición es
   * anónima. Es lo que deben usar las reglas de negocio que dependen de quién
   * pide —propiedad de un recurso, permisos—, nunca el nombre, que puede
   * cambiar.
   */
  getCurrentUserId(): string | null;

  getRequestId(): string | undefined;
}
