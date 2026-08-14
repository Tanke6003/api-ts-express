// src/application/dtos/branches.dtos.ts
import { z } from "zod";
import { defineDto, definePagedDto } from "./dto.registry";

export const branchDto = defineDto(
  "Branch",
  z.object({
    id: z.int().meta({ examples: [1] }),
    name: z.string().meta({ examples: ["Sucursal Centro"] }),
    address: z.string().nullish().meta({ examples: ["Av. Juárez 100, Centro"] }),
    phone: z.string().nullish().meta({ examples: ["+52 55 5000 0001"] }),
    opensAt: z.string().optional().meta({ examples: ["09:00"] }),
    closesAt: z.string().optional().meta({ examples: ["19:00"] }),
    available: z.boolean().optional().meta({
      description: "Estado del borrado lógico; sólo se ve al consultar con `withDeleted`.",
    }),
  })
);

export const paginatedBranchesDto = definePagedDto("PaginatedBranches", branchDto);

export type BranchDTO = z.infer<typeof branchDto>;

export interface CreateBranchDTO {
  name: string;
  address?: string | null;
  phone?: string | null;
  opensAt?: string;
  closesAt?: string;
}

export type UpdateBranchDTO = Partial<CreateBranchDTO>;

/** Filtros de la consulta de sucursales. */
export interface BranchQueryDTO {
  page: number;
  limit: number;
  /** Búsqueda por nombre o dirección, sin distinguir mayúsculas. */
  search?: string;
  withDeleted?: boolean;
}
