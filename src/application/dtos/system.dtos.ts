// src/application/dtos/system.dtos.ts
//
// Lo que la plantilla expone por sí misma, sin dominio detrás: la identidad de
// la petición y la bitácora de cambios.
import { z } from "zod";
import { AUDIT_ACTIONS } from "../../domain/models/audit-log.model";
import { defineDto, definePagedDto } from "./dto.registry";

export const identityDto = defineDto(
  "Identity",
  z.object({
    id: z.string().meta({ examples: ["7"] }),
    name: z.string().meta({ examples: ["Ruben"] }),
    email: z.string().nullable().meta({ examples: ["ruben@example.com"] }),
    requestId: z.string().optional().meta({
      description: "Mismo valor que la cabecera X-Request-Id.",
    }),
  })
);

export const auditLogDto = defineDto(
  "AuditLog",
  z.object({
    id: z.int(),
    entity: z.string().meta({ examples: ["USERS"] }),
    entityId: z.string().nullable().meta({
      description: "PK afectada; nulo en las operaciones masivas.",
    }),
    action: z.enum(AUDIT_ACTIONS),
    changedBy: z.string().meta({ examples: ["Ruben"] }),
    changedAt: z.string().meta({ format: "date-time" }),
    requestId: z.string().nullable().meta({
      description: "Filtrar por él reconstruye todo lo que hizo una misma petición.",
    }),
    changes: z.unknown().nullable().meta({
      description: "Detalle del cambio: el después de un alta, o el antes y el después de un update.",
    }),
  })
);

export const paginatedAuditLogDto = definePagedDto("PaginatedAuditLog", auditLogDto);

export const tokenDto = defineDto(
  "Token",
  z.object({
    token: z.string().meta({ description: "JWT firmado, válido durante una hora." }),
  })
);

export const uploadedFileDto = defineDto(
  "UploadedFile",
  z.object({ path: z.string() })
);

export const uploadedFilesDto = defineDto(
  "UploadedFiles",
  z.object({ paths: z.array(z.string()) })
);

export type IdentityDTO = z.infer<typeof identityDto>;
export type AuditLogDTO = z.infer<typeof auditLogDto>;
