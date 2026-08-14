/**
 * @openapi
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         name:
 *           type: string
 *           example: John Doe
 *         email:
 *           type: string
 *           nullable: true
 *           example: john@example.com
 *         phone:
 *           type: string
 *           nullable: true
 *           example: "+52 55 1111 1111"
 *         wallet:
 *           type: number
 *           nullable: true
 *           example: 100.00
 *         isClient:
 *           type: boolean
 *           example: true
 *     PaginatedUsers:
 *       type: object
 *       properties:
 *         data:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/User'
 *         total:
 *           type: integer
 *           example: 42
 *         page:
 *           type: integer
 *           example: 1
 *         limit:
 *           type: integer
 *           example: 10
 *         pages:
 *           type: integer
 *           example: 5
 */
export interface UserDTO {
  id: number;
  name: string;
  /** Sólo lo informan los drivers cuyo esquema los tiene (Oracle). */
  email?: string | null;
  phone?: string | null;
  wallet?: number | null;
  /** Los clientes pueden ser titulares de una cita. */
  isClient?: boolean;
}

// Reexportados para no romper los imports existentes; su definición vive ahora
// en common.dtos.ts, compartida con el resto de módulos.
export type { PaginationDTO, PaginatedDTO } from "./common.dtos";
