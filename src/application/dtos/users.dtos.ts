// src/application/dtos/users.dtos.ts
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
 */
export interface UserDTO {
    id: number;
    name: string;
}