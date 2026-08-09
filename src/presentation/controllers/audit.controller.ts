// src/presentation/controllers/audit.controller.ts
import { Request, Response, NextFunction } from "express";
import { inject, injectable } from "tsyringe";
import type { IGenericRepository, WhereFilter } from "../../domain/interfaces/infrastructure/repositories/generic.repository.interface";
import type { IRequestContext } from "../../domain/interfaces/infrastructure/plugins/request-context.plugin.interface";
import type { IAuditLog } from "../../domain/models/audit-log.model";
import { IAuditController } from "../../domain/interfaces/presentation/controllers/audit.controller.interface";
import type { AuditQueryInput } from "../../application/validators/audit.validators";
import { BaseController } from "./base.controller";

/**
 * Consulta de la bitácora. Sólo lectura: las líneas las escribe el repositorio
 * genérico, nunca un cliente.
 *
 * No pasa por un servicio porque no hay ninguna regla de negocio que aplicar
 * —es una proyección directa del almacén—; añadir una capa aquí sería ceremonia
 * sin contenido.
 */
@injectable()
export class AuditController extends BaseController implements IAuditController {
  constructor(
    @inject("AuditLogStore") private readonly store: IGenericRepository<IAuditLog>,
    @inject("IRequestContext") context: IRequestContext
  ) {
    super(context);
  }

  public getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = (req.validatedQuery as AuditQueryInput | undefined) ?? { page: 1, limit: 20 };

      const conditions: WhereFilter<IAuditLog>[] = [];
      if (query.entity) conditions.push({ entity: query.entity.toUpperCase() });
      if (query.entityId) conditions.push({ entityId: query.entityId });
      if (query.action) conditions.push({ action: query.action });
      if (query.changedBy) conditions.push({ changedBy: { ilike: `%${query.changedBy}%` } });
      if (query.requestId) conditions.push({ requestId: query.requestId });

      const paged = await this.store.getPaged(query.page, query.limit, {
        where: conditions.length > 0 ? { $and: conditions } : undefined,
        // Lo más reciente primero: es como se lee una bitácora.
        orderBy: { field: "pkAudit", direction: "desc" },
      });

      res.json({
        data: paged.items.map((entry) => ({
          id: entry.pkAudit,
          entity: entry.entity,
          entityId: entry.entityId ?? null,
          action: entry.action,
          changedBy: entry.changedBy,
          changedAt: entry.changedAt ? new Date(entry.changedAt).toISOString() : null,
          requestId: entry.requestId ?? null,
          // Se devuelve ya parseado; se guarda como texto para no atar la
          // bitácora al soporte JSON nativo de cada motor.
          changes: entry.changes ? safeParse(entry.changes) : null,
        })),
        total: paged.total,
        page: paged.page,
        limit: paged.limit,
        pages: paged.pages,
      });
    } catch (err) {
      next(err);
    }
  };
}

/** Una línea corrupta o truncada no debe tumbar la consulta entera. */
function safeParse(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
