// src/core/di/datasource.factory.ts
import { UsersGenericDataSource } from "../../infrastructure/datasources/generic/users.generic.datasource";
import { UsersSqlServerDataSource } from "../../infrastructure/datasources/sqlserver/users.sqlserver.datasource";

/**
 * Implementaciones disponibles de IUsersDataSource, indexadas por el valor
 * de la variable de entorno DATA_SOURCE.
 *
 * `dummy` y `oracle` comparten implementación a propósito: ambas delegan en el
 * repositorio genérico (`UsersStore`), que es en memoria o sobre Oracle según el
 * driver. El CRUD sólo está escrito una vez.
 */
export const USERS_DATASOURCES: Record<
  string,
  typeof UsersGenericDataSource | typeof UsersSqlServerDataSource
> = {
  dummy: UsersGenericDataSource,
  oracle: UsersGenericDataSource,
  sqlserver: UsersSqlServerDataSource,
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
