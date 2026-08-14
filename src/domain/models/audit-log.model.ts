// src/domain/models/audit-log.model.ts

export const AUDIT_ACTIONS = [
  "INSERT",
  "INSERT_MANY",
  "UPDATE",
  "UPDATE_MANY",
  "SOFT_DELETE",
  "RESTORE",
  "HARD_DELETE",
  "HARD_DELETE_MANY",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

/**
 * Una línea de la bitácora: qué se tocó, quién y cuándo.
 *
 * Es complementaria de las columnas `CREATED_BY` / `UPDATED_BY`, que sólo
 * guardan el último estado. La bitácora conserva el histórico completo,
 * incluidas las filas que ya se borraron físicamente.
 */
export interface IAuditLog {
  pkAudit: number;
  /** Nombre lógico de la entidad (ver `ENTITY_NAMES`). */
  entity: string;
  /** PK afectada; nulo en las operaciones masivas, que no apuntan a una sola. */
  entityId?: string | null;
  action: AuditAction;
  changedBy: string;
  changedAt?: Date | null;
  /** Id de la petición que la provocó; permite reconstruir una operación entera. */
  requestId?: string | null;
  /** Detalle en JSON: valores nuevos, o el antes y el después de un update. */
  changes?: string | null;
}
