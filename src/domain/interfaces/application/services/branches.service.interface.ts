// src/domain/interfaces/services/branches.service.interface.ts

import type { ICrudService } from "../../../../application/services/crud.service";
import type { BranchDTO } from "../../../../application/dtos/branches.dtos";

/** El CRUD estándar más las dos operaciones propias de una sucursal. */
export interface IBranchesService extends ICrudService<BranchDTO> {
  restore(id: number): Promise<boolean>;
  hardDelete(id: number): Promise<boolean>;
}
