// src/core/di/container.ts
import "reflect-metadata";
import { container } from "tsyringe";
import { WinstonPlugin } from "../../infrastructure/plugins/winston.plugin";
import { ILogger } from "../../domain/interfaces/infrastructure/plugins/logger.plugin.interface";
import { IUsersDataSource } from "../../domain/interfaces/infrastructure/datasources/users.datasource.interface";
import { UsersSqlServerDataSource } from "../../infrastructure/datasources/sqlserver/users.sqlserver.datasource";
import { IUsersRepository } from "../../domain/interfaces/infrastructure/repositories/users.repository.interface";
import { UsersRepository } from "../../infrastructure/repositories/user.repository";
import { IUsersService } from "../../domain/interfaces/application/services/users.service.interface";
import { UsersService } from "../../application/services/users.service";
import { IUsersController } from "../../domain/interfaces/presentation/controllers/users.controller.interface";
import { UsersController } from "../../presentation/controllers/users.controller";
import { IEnvs } from "../../domain/interfaces/infrastructure/plugins/envs.plugin.interface";
import { DotenvPlugin } from "../../infrastructure/plugins/dotenv.plugin";
// ========== Plugins =================
container.register<ILogger>("ILogger", {
  useClass: WinstonPlugin,
});

container.register<IEnvs>("IEnvs",{
  useClass:DotenvPlugin
})


// ========== DataSources =================
container.register<IUsersDataSource>("IUsersDataSource", { useClass: UsersSqlServerDataSource });

// ========== Repositories =================

container.register<IUsersRepository>("IUsersRepository",{useClass:UsersRepository})

// ========== Services  ======================

container.register<IUsersService>("IUsersService",{useClass:UsersService})


// ========== controllers ======================

container.register<IUsersController>("IUsersController",{useClass:UsersController})






export { container };
