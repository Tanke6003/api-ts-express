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
}

export interface PaginationDTO {
  page: number;
  limit: number;
}

export interface PaginatedDTO<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}
