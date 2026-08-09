// src/core/di/repository.factory.ts
import type { IEnvs } from "../../domain/interfaces/infrastructure/plugins/envs.plugin.interface";
import type { ILogger } from "../../domain/interfaces/infrastructure/plugins/logger.plugin.interface";
import type { IRequestContext } from "../../domain/interfaces/infrastructure/plugins/request-context.plugin.interface";
import type { IGenericRepository } from "../../domain/interfaces/infrastructure/repositories/generic.repository.interface";
import type { IUnitOfWork } from "../../domain/interfaces/infrastructure/repositories/unit-of-work.interface";
import { ENTITY_NAMES } from "../../domain/models/entity-names";
import type { IUser } from "../../domain/models/users.model";
import type { IBranch } from "../../domain/models/branches.model";
import type { IAppointment } from "../../domain/models/appointments.model";
import type { IAuditLog } from "../../domain/models/audit-log.model";
import type { IAuditTrail } from "../../domain/interfaces/infrastructure/repositories/audit-trail.interface";
import { OraclePlugin } from "../../infrastructure/plugins/oracle.plugin";
import { SqlServerPlugin } from "../../infrastructure/plugins/sqlserver.plugin";
import { EntityMetadata } from "../../infrastructure/repositories/base/entity-metadata";
import { MemoryGenericRepository } from "../../infrastructure/repositories/base/memory.generic.repository";
import { SqlGenericRepository } from "../../infrastructure/repositories/base/sql.generic.repository";
import { OracleGenericRepository } from "../../infrastructure/repositories/base/oracle.generic.repository";
import { SqlServerGenericRepository } from "../../infrastructure/repositories/base/sqlserver.generic.repository";
import { MemoryUnitOfWork } from "../../infrastructure/repositories/base/memory.unit-of-work";
import {
  ISqlTransactionRunner,
  SqlUnitOfWork,
} from "../../infrastructure/repositories/base/sql.unit-of-work";
import {
  APPOINTMENTS_ENTITY,
  AUDIT_LOG_ENTITY,
  BRANCHES_ENTITY,
  USERS_ENTITY,
} from "../../infrastructure/repositories/entities";
import {
  MemoryAuditTrail,
  SqlAuditTrail,
} from "../../infrastructure/repositories/base/audit-trail";
import {
  APPOINTMENTS_SEED,
  BRANCHES_SEED,
  USERS_SEED,
} from "../../infrastructure/repositories/seed-data";

/** Driver de persistencia resuelto a partir de `DATA_SOURCE`. */
export type PersistenceDriver = "memory" | "oracle" | "mssql";

/** Lo que el arranque necesita de una conexión, sea cual sea el motor. */
export interface IManagedConnection {
  authenticate(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Capa de persistencia ya construida: los repositorios genéricos de cada
 * entidad, la unidad de trabajo y —si el driver es SQL— la conexión.
 */
export interface PersistenceLayer {
  driver: PersistenceDriver;
  stores: {
    users: IGenericRepository<IUser>;
    branches: IGenericRepository<IBranch>;
    appointments: IGenericRepository<IAppointment>;
    /** Sólo lectura desde la aplicación: la escribe el propio repositorio. */
    auditLog: IGenericRepository<IAuditLog>;
  };
  unitOfWork: IUnitOfWork;
  /** Bitácora de cambios que alimentan los repositorios. */
  auditTrail: IAuditTrail;
  /** Ausente en memoria: no hay nada que abrir ni cerrar. */
  connection?: IManagedConnection;
}

export function resolveDriver(dataSource?: string): PersistenceDriver {
  const value = (dataSource || "dummy").toLowerCase();
  if (value === "oracle") return "oracle";
  if (value === "sqlserver" || value === "mssql") return "mssql";
  return "memory";
}

export function isOracleDriver(dataSource?: string): boolean {
  return resolveDriver(dataSource) === "oracle";
}

const toInt = (value: string, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/** Configuración de Oracle, con valores por defecto alineados con docker-compose. */
export function buildOracleConfig(envs: IEnvs) {
  return {
    user: envs.getEnv("ORACLE_USER") || "appuser",
    password: envs.getEnv("ORACLE_PASSWORD"),
    connectString: envs.getEnv("ORACLE_CONNECT_STRING") || "localhost:1521/FREEPDB1",
    poolMin: toInt(envs.getEnv("ORACLE_POOL_MIN"), 1),
    poolMax: toInt(envs.getEnv("ORACLE_POOL_MAX"), 10),
    poolIncrement: toInt(envs.getEnv("ORACLE_POOL_INCREMENT"), 1),
  };
}

/** Configuración de SQL Server, reutilizando las variables DB_* ya existentes. */
export function buildSqlServerConfig(envs: IEnvs) {
  return {
    host: envs.getEnv("DB_HOST") || "localhost",
    port: toInt(envs.getEnv("DB_PORT"), 1434),
    username: envs.getEnv("DB_USER") || "sa",
    password: envs.getEnv("DB_PASSWORD"),
    database: envs.getEnv("DB_NAME") || "testdb",
  };
}

/** Crea el repositorio de una entidad para el motor elegido. */
type SqlRepositoryFactory = <T extends object>(
  metadata: EntityMetadata<T>,
  auditTrail?: IAuditTrail
) => SqlGenericRepository<T>;

/**
 * Monta las tres entidades y la unidad de trabajo sobre un motor SQL. Oracle y
 * SQL Server sólo se diferencian en qué repositorio construye `create`.
 */
function buildSqlPersistence(
  driver: PersistenceDriver,
  runner: ISqlTransactionRunner,
  connection: IManagedConnection,
  create: SqlRepositoryFactory,
  context?: IRequestContext
): PersistenceLayer {
  // La bitácora se construye primero y sin bitácora propia: registrarse a sí
  // misma sería recursivo.
  const auditLog = create<IAuditLog>(AUDIT_LOG_ENTITY);
  const auditTrail = new SqlAuditTrail(auditLog);

  const users = create(USERS_ENTITY, auditTrail);
  const branches = create(BRANCHES_ENTITY, auditTrail);
  const appointments = create(APPOINTMENTS_ENTITY, auditTrail);

  // El registro es heterogéneo por naturaleza: la unidad de trabajo lo indexa
  // por nombre de entidad y devuelve el tipo concreto en `repository<T>()`.
  const registry = new Map(
    [
      [ENTITY_NAMES.USERS, users],
      [ENTITY_NAMES.BRANCHES, branches],
      [ENTITY_NAMES.APPOINTMENTS, appointments],
    ].map(([name, repository]) => [
      name as string,
      repository as unknown as SqlGenericRepository<never, never>,
    ])
  );

  return {
    driver,
    stores: { users, branches, appointments, auditLog },
    unitOfWork: new SqlUnitOfWork(runner, registry),
    auditTrail,
    connection,
  };
}

/**
 * Construye la capa de persistencia según `DATA_SOURCE`.
 *
 * - `oracle`: repositorios genéricos sobre el pool de Oracle, transacciones reales.
 * - `sqlserver`: los mismos repositorios sobre SQL Server (Sequelize + tedious).
 * - cualquier otro valor: repositorios en memoria con los mismos datos de ejemplo,
 *   para poder desarrollar y correr los tests sin levantar Docker.
 *
 * En los tres casos los servicios reciben exactamente la misma interfaz.
 */
export function createPersistenceLayer(
  envs: IEnvs,
  logger: ILogger,
  /** Provee el usuario de las columnas de auditoría. */
  context?: IRequestContext
): PersistenceLayer {
  const driver = resolveDriver(envs.getEnv("DATA_SOURCE"));

  if (driver === "oracle") {
    const oracle = new OraclePlugin(buildOracleConfig(envs), logger);
    return buildSqlPersistence(
      driver,
      oracle,
      oracle,
      <T extends object>(metadata: EntityMetadata<T>, auditTrail?: IAuditTrail) =>
        new OracleGenericRepository<T>(oracle, metadata, logger, context, auditTrail),
      context
    );
  }

  if (driver === "mssql") {
    const sqlServer = new SqlServerPlugin(buildSqlServerConfig(envs), logger);
    return buildSqlPersistence(
      driver,
      sqlServer,
      sqlServer,
      <T extends object>(metadata: EntityMetadata<T>, auditTrail?: IAuditTrail) =>
        new SqlServerGenericRepository<T>(sqlServer, metadata, logger, context, auditTrail),
      context
    );
  }

  const memoryStore = <T extends object>(
    metadata: EntityMetadata<T>,
    seed: Partial<T>[],
    trail?: IAuditTrail
  ) => new MemoryGenericRepository<T>(metadata, seed, context, trail);

  const auditLog = memoryStore<IAuditLog>(AUDIT_LOG_ENTITY, []);
  const auditTrail = new MemoryAuditTrail(auditLog);

  const users = memoryStore(USERS_ENTITY, USERS_SEED, auditTrail);
  const branches = memoryStore(BRANCHES_ENTITY, BRANCHES_SEED, auditTrail);
  const appointments = memoryStore(APPOINTMENTS_ENTITY, APPOINTMENTS_SEED, auditTrail);

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
    driver,
    stores: { users, branches, appointments, auditLog },
    unitOfWork: new MemoryUnitOfWork(registry),
    auditTrail,
  };
}
