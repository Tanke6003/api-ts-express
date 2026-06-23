// src/core/di/datasource.factory.ts
import { UsersDummyDataSource } from "../../infrastructure/datasources/dummy/users.dummy.datasource";
import { UsersSqlServerDataSource } from "../../infrastructure/datasources/sqlserver/users.sqlserver.datasource";

/**
 * Implementaciones disponibles de IUsersDataSource, indexadas por el valor
 * de la variable de entorno DATA_SOURCE.
 */
export const USERS_DATASOURCES: Record<
  string,
  typeof UsersDummyDataSource | typeof UsersSqlServerDataSource
> = {
  dummy: UsersDummyDataSource,
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
