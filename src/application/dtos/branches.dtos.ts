/**
 * @openapi
 * components:
 *   schemas:
 *     Branch:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         name:
 *           type: string
 *           example: Sucursal Centro
 *         address:
 *           type: string
 *           nullable: true
 *           example: Av. Juárez 100, Centro
 *         phone:
 *           type: string
 *           nullable: true
 *           example: "+52 55 5000 0001"
 *         opensAt:
 *           type: string
 *           example: "09:00"
 *         closesAt:
 *           type: string
 *           example: "19:00"
 *         available:
 *           type: boolean
 *           example: true
 *     PaginatedBranches:
 *       type: object
 *       properties:
 *         data:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Branch'
 *         total:
 *           type: integer
 *         page:
 *           type: integer
 *         limit:
 *           type: integer
 *         pages:
 *           type: integer
 */
export interface BranchDTO {
  id: number;
  name: string;
  address?: string | null;
  phone?: string | null;
  opensAt?: string;
  closesAt?: string;
  /** Estado del borrado lógico; sólo se ve al consultar con `withDeleted`. */
  available?: boolean;
}

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
