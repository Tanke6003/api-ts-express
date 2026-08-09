// src/domain/models/entity-names.ts

/**
 * Nombres lógicos de las entidades persistentes.
 *
 * Los usa la unidad de trabajo para pedir el repositorio de una entidad dentro
 * de una transacción, sin que la capa de aplicación tenga que conocer el mapeo
 * físico (que vive en `infrastructure/repositories/entities.ts`).
 */
export const ENTITY_NAMES = {
  USERS: "USERS",
  BRANCHES: "BRANCHES",
  APPOINTMENTS: "APPOINTMENTS",
} as const;

export type EntityName = (typeof ENTITY_NAMES)[keyof typeof ENTITY_NAMES];
