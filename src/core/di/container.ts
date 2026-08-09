// src/core/di/container.ts
import "reflect-metadata";
import { container } from "tsyringe";
import { ILogger } from "../../domain/interfaces/infrastructure/plugins/logger.plugin.interface";
import { IUsersDataSource } from "../../domain/interfaces/infrastructure/datasources/users.datasource.interface";
import { resolveUsersDataSource } from "./datasource.factory";
import { createLogger } from "./logger.factory";
import { createPersistenceLayer, isOracleDriver } from "./repository.factory";
import { validateCriticalEnvs } from "../config/env.validation";
import { IUsersRepository } from "../../domain/interfaces/infrastructure/repositories/users.repository.interface";
import { UsersRepository } from "../../infrastructure/repositories/users.repository";
import { IUsersService } from "../../domain/interfaces/application/services/users.service.interface";
import { UsersService } from "../../application/services/users.service";
import { IUsersController } from "../../domain/interfaces/presentation/controllers/users.controller.interface";
import { UsersController } from "../../presentation/controllers/users.controller";
import { IEnvs } from "../../domain/interfaces/infrastructure/plugins/envs.plugin.interface";
import { DotenvPlugin } from "../../infrastructure/plugins/dotenv.plugin";
import { ITokenPlugin } from "../../domain/interfaces/infrastructure/plugins/token.plugin.interface";
import { JwtPlugin } from "../../infrastructure/plugins/jwt.plugin";
import { ISqlConnectionPlugin } from "../../domain/interfaces/infrastructure/plugins/sql.plugin.interface";
import { SequelizePlugin } from "../../infrastructure/plugins/sequelize.plugin";
import { IFileStorage } from "../../domain/interfaces/infrastructure/plugins/fileStorage.plugin.interface";
import { NativeFileStoragePlugin } from "../../infrastructure/plugins/nativeFileStorage.plugin";
import { IUnitOfWork } from "../../domain/interfaces/infrastructure/repositories/unit-of-work.interface";
import { IBranchesRepository } from "../../domain/interfaces/infrastructure/repositories/branches.repository.interface";
import { BranchesRepository } from "../../infrastructure/repositories/branches.repository";
import { IAppointmentsRepository } from "../../domain/interfaces/infrastructure/repositories/appointments.repository.interface";
import { AppointmentsRepository } from "../../infrastructure/repositories/appointments.repository";
import { IBranchesService } from "../../domain/interfaces/application/services/branches.service.interface";
import { BranchesService } from "../../application/services/branches.service";
import { IAppointmentsService } from "../../domain/interfaces/application/services/appointments.service.interface";
import { AppointmentsService } from "../../application/services/appointments.service";
import { IBranchesController } from "../../domain/interfaces/presentation/controllers/branches.controller.interface";
import { BranchesController } from "../../presentation/controllers/branches.controller";
import { IAppointmentsController } from "../../domain/interfaces/presentation/controllers/appointments.controller.interface";
import { AppointmentsController } from "../../presentation/controllers/appointments.controller";
// ========== Plugins =================
container.registerSingleton<IEnvs>("IEnvs", DotenvPlugin);

const envs:IEnvs = container.resolve("IEnvs");

// Falla de forma ruidosa si faltan secretos críticos, en vez de degradarse
// silenciosamente con valores por defecto inseguros.
validateCriticalEnvs(envs);

// El logger se selecciona vía la env var LOG_DRIVER ("pino" | "winston"),
// con "pino" por defecto. Winston queda disponible para conmutar cuando se quiera.
container.register<ILogger>("ILogger", {
  useValue: createLogger(envs),
});

const logger = container.resolve<ILogger>("ILogger");

container.register<ITokenPlugin>("ITokenPlugin", {
  useClass: JwtPlugin
});

container.register<ISqlConnectionPlugin>("TestDB", {
  useValue: new SequelizePlugin(
    {
      dialect: envs.getEnv("DB_DIALECT") || "mssql",
      host: envs.getEnv("DB_HOST") || "localhost",
      port: Number(envs.getEnv("DB_PORT") || "1434"),
      username: envs.getEnv("DB_USER") || "sa",
      password: envs.getEnv("DB_PASSWORD"),
      database: envs.getEnv("DB_NAME") || "testdb",
    },
    logger
  ),
});

container.register<IFileStorage>("IFileStorage", {
  useValue: new NativeFileStoragePlugin(),
});

// ========== Persistencia genérica =================
// Un único punto construye los repositorios genéricos de todas las entidades y
// la unidad de trabajo: sobre Oracle si DATA_SOURCE=oracle, en memoria si no.
const persistence = createPersistenceLayer(envs, logger);

container.register("UsersStore", { useValue: persistence.stores.users });
container.register("BranchesStore", { useValue: persistence.stores.branches });
container.register("AppointmentsStore", { useValue: persistence.stores.appointments });
container.register<IUnitOfWork>("IUnitOfWork", { useValue: persistence.unitOfWork });


// ========== DataSources =================
// La implementación se selecciona vía la env var DATA_SOURCE
// ("dummy" | "sqlserver" | "oracle"), con "dummy" por defecto en desarrollo.
container.register<IUsersDataSource>("IUsersDataSource", {
  useClass: resolveUsersDataSource(envs.getEnv("DATA_SOURCE")),
});

// ========== Repositories =================

container.register<IUsersRepository>("IUsersRepository", { useClass: UsersRepository });
container.register<IBranchesRepository>("IBranchesRepository", { useClass: BranchesRepository });
container.register<IAppointmentsRepository>("IAppointmentsRepository", {
  useClass: AppointmentsRepository,
});

// ========== Services  ======================

container.register<IUsersService>("IUsersService", { useClass: UsersService });
container.register<IBranchesService>("IBranchesService", { useClass: BranchesService });
container.register<IAppointmentsService>("IAppointmentsService", { useClass: AppointmentsService });


// ========== controllers ======================

container.register<IUsersController>("IUsersController", { useClass: UsersController });
container.register<IBranchesController>("IBranchesController", { useClass: BranchesController });
container.register<IAppointmentsController>("IAppointmentsController", {
  useClass: AppointmentsController,
});

/**
 * Comprueba la conexión al arrancar cuando el driver es Oracle, para que un
 * problema de credenciales o de red se vea en el log del arranque y no en la
 * primera petición del usuario.
 */
export async function warmUpConnections(): Promise<void> {
  if (!isOracleDriver(envs.getEnv("DATA_SOURCE")) || !persistence.oracle) return;
  await persistence.oracle.authenticate();
}

/** Cierra los recursos abiertos (pool de Oracle) en un apagado ordenado. */
export async function shutdownConnections(): Promise<void> {
  await persistence.oracle?.close();
}

export { container };
