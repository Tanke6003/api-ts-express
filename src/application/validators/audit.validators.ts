import { z } from "zod";
import { AUDIT_ACTIONS } from "../../domain/models/audit-log.model";

export const auditQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((value) => (value ? parseInt(value, 10) : 1))
    .pipe(z.number().int().min(1, "page must be >= 1")),
  limit: z
    .string()
    .optional()
    .transform((value) => (value ? parseInt(value, 10) : 20))
    .pipe(z.number().int().min(1).max(100, "limit must be <= 100")),
  /** Nombre lógico de la entidad: USERS, BRANCHES, APPOINTMENTS. */
  entity: z.string().trim().min(1).max(50).optional(),
  entityId: z.string().trim().min(1).max(50).optional(),
  action: z.enum(AUDIT_ACTIONS).optional(),
  changedBy: z.string().trim().min(1).max(100).optional(),
  /** Permite reconstruir todo lo que hizo una misma petición. */
  requestId: z.string().trim().min(1).max(64).optional(),
});

export type AuditQueryInput = z.infer<typeof auditQuerySchema>;
