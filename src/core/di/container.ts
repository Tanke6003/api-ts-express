// src/core/di/container.ts
import "reflect-metadata";
import { container } from "tsyringe";
import { WinstonPlugin } from "../../infrastructure/plugins/winston.plugin";
import { ILogger } from "../../domain/interfaces/infrastructure/plugins/logger.plugin.interface";
import { IUsersDataSource } from "../../domain/interfaces/infrastructure/datasources/users.datasource.interface";
import { UsersSqlServerDataSource } from "../../infrastructure/datasources/sqlserver/users.sqlserver.datasource";
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
import { UsersDummyDataSource } from "../../infrastructure/datasources/dummy/users.dummy.datasource";
// ========== Plugins =================
container.registerSingleton<ILogger>("ILogger", WinstonPlugin);

container.register<IEnvs>("IEnvs", {
  useClass: DotenvPlugin
});
container.register<ITokenPlugin>("ITokenPlugin", {
  useClass: JwtPlugin
});

container.register<ISqlConnectionPlugin>("TestDB", {
  useValue: new SequelizePlugin({
      dialect: "mssql",
      host: process.env.DB_HOST || "localhost",
      port: Number(process.env.DB_PORT) || 1434,
      username: process.env.DB_USER || "sa",
      password: process.env.DB_PASSWORD || "StrongPassword123!",
      database: process.env.DB_NAME || "testdb",
    }),
});

// ========== DataSources =================
container.register<IUsersDataSource>("IUsersDataSource", { useClass: UsersDummyDataSource  });

// ========== Repositories =================

container.register<IUsersRepository>("IUsersRepository", { useClass: UsersRepository });

// ========== Services  ======================

container.register<IUsersService>("IUsersService", { useClass: UsersService });


// ========== controllers ======================

container.register<IUsersController>("IUsersController", { useClass: UsersController });






export { container };
