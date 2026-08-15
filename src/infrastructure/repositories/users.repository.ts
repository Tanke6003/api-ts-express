// src/infrastructure/repositories/users.repository.ts
import { inject, injectable } from "tsyringe";
import type { IUsersRepository } from "../../domain/interfaces/infrastructure/repositories/users.repository.interface";
import type { IGenericRepository } from "../../domain/interfaces/infrastructure/repositories/generic.repository.interface";
import type { ILogger } from "../../domain/interfaces/infrastructure/plugins/logger.plugin.interface";
import type { IUser } from "../../domain/models/users.model";
import { BaseModuleRepository } from "./base/module.repository";
import { TOKENS } from "../../core/di/tokens";
import { ENTITY_NAMES } from "../../domain/models/entity-names";
import type { ITransactionContext } from "../../domain/interfaces/infrastructure/plugins/transaction-context.plugin.interface";

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
    @inject(TOKENS.UsersStore) store: IGenericRepository<IUser>,
    @inject(TOKENS.ILogger) logger: ILogger,
    @inject(TOKENS.ITransactionContext) transactions?: ITransactionContext
  ) {
    super(store, logger, "UsersRepository", ENTITY_NAMES.USERS, transactions);
  }
}
