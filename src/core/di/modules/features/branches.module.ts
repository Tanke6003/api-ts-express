// src/core/di/modules/features/branches.module.ts
import { container } from "tsyringe";
import type { IBranchesRepository } from "../../../../domain/interfaces/infrastructure/repositories/branches.repository.interface";
import type { IBranchesService } from "../../../../domain/interfaces/application/services/branches.service.interface";
import type { IBranchesController } from "../../../../domain/interfaces/presentation/controllers/branches.controller.interface";
import { BranchesRepository } from "../../../../infrastructure/repositories/branches.repository";
import { BranchesService } from "../../../../application/services/branches.service";
import { BranchesController } from "../../../../presentation/controllers/branches.controller";
import { TOKENS } from "../../tokens";

/** Sucursales: sólo un ejemplo del dominio, se borra entero sin tocar el resto. */
export function registerBranches(): void {
  container.register<IBranchesRepository>(TOKENS.IBranchesRepository, {
    useClass: BranchesRepository,
  });
  container.register<IBranchesService>(TOKENS.IBranchesService, { useClass: BranchesService });
  container.register<IBranchesController>(TOKENS.IBranchesController, {
    useClass: BranchesController,
  });
}
