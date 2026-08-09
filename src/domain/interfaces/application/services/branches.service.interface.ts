// src/domain/interfaces/application/services/branches.service.interface.ts
import {
  BranchDTO,
  BranchQueryDTO,
  CreateBranchDTO,
  UpdateBranchDTO,
} from "../../../../application/dtos/branches.dtos";
import { PaginatedDTO } from "../../../../application/dtos/common.dtos";

export interface IBranchesService {
  getAll(query: BranchQueryDTO): Promise<PaginatedDTO<BranchDTO>>;
  getById(id: number): Promise<BranchDTO | null>;
  create(branch: CreateBranchDTO): Promise<BranchDTO>;
  update(id: number, branch: UpdateBranchDTO): Promise<BranchDTO | null>;
  /**
   * Baja lógica. Arrastra la cancelación de las citas futuras de la sucursal,
   * así que es una operación transaccional.
   */
  softDelete(id: number): Promise<boolean>;
  restore(id: number): Promise<boolean>;
  /**
   * Baja física. Borra antes las citas que la referencian por clave foránea,
   * dentro de la misma transacción.
   */
  hardDelete(id: number): Promise<boolean>;
}
