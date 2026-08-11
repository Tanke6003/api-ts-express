// src/infrastructure/repositories/users.repository.ts
import { inject, injectable } from "tsyringe";
import type { IUsersRepository } from "../../domain/interfaces/infrastructure/repositories/users.repository.interface";
import type { IGenericRepository } from "../../domain/interfaces/infrastructure/repositories/generic.repository.interface";
import type { ILogger } from "../../domain/interfaces/infrastructure/plugins/logger.plugin.interface";
import type { IUser } from "../../domain/models/users.model";
import { BaseModuleRepository } from "./base/module.repository";

/**
 * Todo el acceso a datos de usuarios viene del repositorio genérico: esta clase
 * no escribe SQL, sólo aporta el contexto para los logs.
 *
 * `UsersStore` es el repositorio genérico del driver activo, resuelto en el
 * contenedor de DI.
 */
@injectable()
export class UsersRepository extends BaseModuleRepository<IUser> implements IUsersRepository {
  constructor(
    @inject("UsersStore") store: IGenericRepository<IUser>,
    @inject("ILogger") logger: ILogger
  ) {
    super(store, logger, "UsersRepository");
  }
}
