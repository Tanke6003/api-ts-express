// src/infrastructure/repositories/branches.repository.ts
import { inject, injectable } from "tsyringe";
import type { IBranchesRepository } from "../../domain/interfaces/infrastructure/repositories/branches.repository.interface";
import type { IGenericRepository } from "../../domain/interfaces/infrastructure/repositories/generic.repository.interface";
import type { ILogger } from "../../domain/interfaces/infrastructure/plugins/logger.plugin.interface";
import type { IBranch } from "../../domain/models/branches.model";
import { BaseModuleRepository } from "./base/module.repository";
import { TOKENS } from "../../core/di/tokens";

/**
 * Todo el acceso a datos de sucursales viene del repositorio genérico: esta
 * clase no escribe SQL, sólo aporta el contexto para los logs.
 *
 * `BranchesStore` es el repositorio genérico del driver activo (Oracle o
 * memoria), resuelto en el contenedor de DI.
 */
@injectable()
export class BranchesRepository
  extends BaseModuleRepository<IBranch>
  implements IBranchesRepository
{
  constructor(
    @inject(TOKENS.BranchesStore) store: IGenericRepository<IBranch>,
    @inject(TOKENS.ILogger) logger: ILogger
  ) {
    super(store, logger, "BranchesRepository");
  }
}
