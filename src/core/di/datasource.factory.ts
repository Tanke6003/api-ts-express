// src/core/di/datasource.factory.ts
import { UsersGenericDataSource } from "../../infrastructure/datasources/generic/users.generic.datasource";

/**
 * Implementaciones disponibles de IUsersDataSource, indexadas por el valor
 * de la variable de entorno DATA_SOURCE.
 *
 * Los tres comparten implementación a propósito: todos delegan en el
 * repositorio genérico (`UsersStore`), que por debajo es memoria, Oracle o SQL
 * Server según el driver. El CRUD sólo está escrito una vez.
 */
export const USERS_DATASOURCES: Record<string, typeof UsersGenericDataSource> = {
  dummy: UsersGenericDataSource,
  oracle: UsersGenericDataSource,
  sqlserver: UsersGenericDataSource,
};

/**
 * Resuelve la clase de datasource a registrar en el contenedor según el valor
 * de DATA_SOURCE. Por defecto usa "dummy" (apto para desarrollo).
 * Falla de forma ruidosa si el valor no corresponde a una implementación conocida.
 */
export function resolveUsersDataSource(name?: string) {
  const key = (name || "dummy").toLowerCase();
  const impl = USERS_DATASOURCES[key];

  if (!impl) {
    throw new Error(
      `[config] Unknown DATA_SOURCE "${name}". Valid values: ${Object.keys(
        USERS_DATASOURCES
      ).join(", ")}.`
    );
  }

  return impl;
}
