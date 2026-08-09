// src/core/di/repository.factory.ts
import type { IEnvs } from "../../domain/interfaces/infrastructure/plugins/envs.plugin.interface";
import type { ILogger } from "../../domain/interfaces/infrastructure/plugins/logger.plugin.interface";
import type { IOracleConnectionPlugin } from "../../domain/interfaces/infrastructure/plugins/oracle.plugin.interface";
import type { IGenericRepository } from "../../domain/interfaces/infrastructure/repositories/generic.repository.interface";
import type { IUnitOfWork } from "../../domain/interfaces/infrastructure/repositories/unit-of-work.interface";
import { ENTITY_NAMES } from "../../domain/models/entity-names";
import type { IUser } from "../../domain/models/users.model";
import type { IBranch } from "../../domain/models/branches.model";
import type { IAppointment } from "../../domain/models/appointments.model";
import { OraclePlugin } from "../../infrastructure/plugins/oracle.plugin";
import { EntityMetadata } from "../../infrastructure/repositories/base/entity-metadata";
import { MemoryGenericRepository } from "../../infrastructure/repositories/base/memory.generic.repository";
import { OracleGenericRepository } from "../../infrastructure/repositories/base/oracle.generic.repository";
import { MemoryUnitOfWork } from "../../infrastructure/repositories/base/memory.unit-of-work";
import { OracleUnitOfWork } from "../../infrastructure/repositories/base/oracle.unit-of-work";
import {
  APPOINTMENTS_ENTITY,
  BRANCHES_ENTITY,
  USERS_ENTITY,
} from "../../infrastructure/repositories/entities";
import {
  APPOINTMENTS_SEED,
  BRANCHES_SEED,
  USERS_SEED,
} from "../../infrastructure/repositories/seed-data";

/**
 * Capa de persistencia ya construida: los repositorios genéricos de cada
 * entidad, la unidad de trabajo y —si el driver es Oracle— la conexión.
 */
export interface PersistenceLayer {
  stores: {
    users: IGenericRepository<IUser>;
    branches: IGenericRepository<IBranch>;
    appointments: IGenericRepository<IAppointment>;
  };
  unitOfWork: IUnitOfWork;
  /** Sólo presente con `DATA_SOURCE=oracle`. */
  oracle?: IOracleConnectionPlugin;
}

export function isOracleDriver(dataSource?: string): boolean {
  return (dataSource || "dummy").toLowerCase() === "oracle";
}

/** Lee la configuración de conexión a Oracle del entorno, con valores por defecto
 *  alineados con los del docker-compose. */
export function buildOracleConfig(envs: IEnvs) {
  const toInt = (value: string, fallback: number): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  };

  return {
    user: envs.getEnv("ORACLE_USER") || "appuser",
    password: envs.getEnv("ORACLE_PASSWORD"),
    connectString: envs.getEnv("ORACLE_CONNECT_STRING") || "localhost:1521/FREEPDB1",
    poolMin: toInt(envs.getEnv("ORACLE_POOL_MIN"), 1),
    poolMax: toInt(envs.getEnv("ORACLE_POOL_MAX"), 10),
    poolIncrement: toInt(envs.getEnv("ORACLE_POOL_INCREMENT"), 1),
  };
}

/**
 * Construye la capa de persistencia según `DATA_SOURCE`.
 *
 * - `oracle`: repositorios genéricos sobre el pool de Oracle y transacciones reales.
 * - cualquier otro valor: repositorios en memoria con los mismos datos de ejemplo,
 *   para poder desarrollar y correr los tests sin levantar Docker.
 *
 * En ambos casos los servicios reciben exactamente la misma interfaz.
 */
export function createPersistenceLayer(envs: IEnvs, logger: ILogger): PersistenceLayer {
  if (isOracleDriver(envs.getEnv("DATA_SOURCE"))) {
    const oracle = new OraclePlugin(buildOracleConfig(envs), logger);

    const users = new OracleGenericRepository<IUser>(oracle, USERS_ENTITY, logger);
    const branches = new OracleGenericRepository<IBranch>(oracle, BRANCHES_ENTITY, logger);
    const appointments = new OracleGenericRepository<IAppointment>(
      oracle,
      APPOINTMENTS_ENTITY,
      logger
    );

    // El registro es heterogéneo por naturaleza: la unidad de trabajo lo indexa
    // por nombre de entidad y devuelve el tipo concreto en `repository<T>()`.
    const registry = new Map(
      [
        [ENTITY_NAMES.USERS, users],
        [ENTITY_NAMES.BRANCHES, branches],
        [ENTITY_NAMES.APPOINTMENTS, appointments],
      ].map(([name, repository]) => [
        name as string,
        repository as unknown as OracleGenericRepository<never, never>,
      ])
    );

    return {
      stores: { users, branches, appointments },
      unitOfWork: new OracleUnitOfWork(oracle, registry),
      oracle,
    };
  }

  const memoryStore = <T extends object>(metadata: EntityMetadata<T>, seed: Partial<T>[]) =>
    new MemoryGenericRepository<T>(metadata, seed);

  const users = memoryStore(USERS_ENTITY, USERS_SEED);
  const branches = memoryStore(BRANCHES_ENTITY, BRANCHES_SEED);
  const appointments = memoryStore(APPOINTMENTS_ENTITY, APPOINTMENTS_SEED);

  const registry = new Map(
    [
      [ENTITY_NAMES.USERS, users],
      [ENTITY_NAMES.BRANCHES, branches],
      [ENTITY_NAMES.APPOINTMENTS, appointments],
    ].map(([name, repository]) => [
      name as string,
      repository as unknown as MemoryGenericRepository<never, never>,
    ])
  );

  return {
    stores: { users, branches, appointments },
    unitOfWork: new MemoryUnitOfWork(registry),
  };
}
