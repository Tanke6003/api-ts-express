// src/core/di/container.ts
import "reflect-metadata";
import { container } from "tsyringe";
import { WinstonPlugin } from "../../infrastructure/plugins/winston.plugin";
import { ILogger } from "../../domain/interfaces/infrastructure/plugins/logger.plugin.interface";
import { IUsersDataSource } from "../../domain/interfaces/infrastructure/datasources/users.datasource.interface";
import { resolveUsersDataSource } from "./datasource.factory";
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
import { PinoLoggerPlugin } from "../../infrastructure/plugins/pino.plugin";
// ========== Plugins =================
container.registerSingleton<IEnvs>("IEnvs", DotenvPlugin);

const envs:IEnvs = container.resolve("IEnvs");

// Falla de forma ruidosa si faltan secretos críticos, en vez de degradarse
// silenciosamente con valores por defecto inseguros.
validateCriticalEnvs(envs);

// container.registerSingleton<ILogger>("ILogger", WinstonPlugin);
container.register<ILogger>("ILogger", {
  useValue: new PinoLoggerPlugin({
    service: "api-ts-express",
    level: envs.getEnv("LOG_LEVEL") || "debug",
  }),
});



container.register<ITokenPlugin>("ITokenPlugin", {
  useClass: JwtPlugin
});

container.register<ISqlConnectionPlugin>("TestDB", {
  useValue: new SequelizePlugin({
    dialect: envs.getEnv("DB_DIALECT") || "mssql",
    host: envs.getEnv("DB_HOST") || "localhost",
    port: Number(envs.getEnv("DB_PORT") || "1434"),
    username: envs.getEnv("DB_USER") || "sa",
    password: envs.getEnv("DB_PASSWORD"),
    database: envs.getEnv("DB_NAME") || "testdb",
  }),
});

container.register<IFileStorage>("IFileStorage",{
 useValue: new NativeFileStoragePlugin()
})
// ========== DataSources =================
// La implementación se selecciona vía la env var DATA_SOURCE ("dummy" | "sqlserver"),
// con "dummy" por defecto en desarrollo.
container.register<IUsersDataSource>("IUsersDataSource", {
  useClass: resolveUsersDataSource(envs.getEnv("DATA_SOURCE")),
});

// ========== Repositories =================

container.register<IUsersRepository>("IUsersRepository", { useClass: UsersRepository });

// ========== Services  ======================

container.register<IUsersService>("IUsersService", { useClass: UsersService });


// ========== controllers ======================

container.register<IUsersController>("IUsersController", { useClass: UsersController });






export { container };
