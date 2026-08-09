// src/presentation/routes/audit.route.ts
import { container } from "tsyringe";
import type { Router } from "express";
import { ITokenPlugin } from "../../domain/interfaces/infrastructure/plugins/token.plugin.interface";
import { IAuditController } from "../../domain/interfaces/presentation/controllers/audit.controller.interface";
import { validateQuery } from "../middlewares/validate.middleware";
import { auditQuerySchema } from "../../application/validators/audit.validators";

export class AuditRoutes {
  private auditController: IAuditController;
  private jwtPlugin: ITokenPlugin;

  constructor() {
    this.auditController = container.resolve<IAuditController>("IAuditController");
    this.jwtPlugin = container.resolve<ITokenPlugin>("ITokenPlugin");
  }

  public register(app: Router) {
    /**
     * @openapi
     * /api/audit:
     *   get:
     *     tags:
     *       - Audit
     *     summary: Bitácora de cambios
     *     description: >
     *       Historial de escrituras que el repositorio genérico registra solo.
     *       Es de sólo lectura: no hay forma de escribir aquí desde la API.
     *     security:
     *       - bearerAuth: []
     *     parameters:
     *       - in: query
     *         name: page
     *         schema:
     *           type: integer
     *           default: 1
     *       - in: query
     *         name: limit
     *         schema:
     *           type: integer
     *           default: 20
     *       - in: query
     *         name: entity
     *         schema:
     *           type: string
     *           enum: [USERS, BRANCHES, APPOINTMENTS]
     *       - in: query
     *         name: entityId
     *         schema:
     *           type: string
     *       - in: query
     *         name: action
     *         schema:
     *           type: string
     *           enum: [INSERT, INSERT_MANY, UPDATE, UPDATE_MANY, SOFT_DELETE, RESTORE, HARD_DELETE, HARD_DELETE_MANY]
     *       - in: query
     *         name: changedBy
     *         schema:
     *           type: string
     *       - in: query
     *         name: requestId
     *         schema:
     *           type: string
     *         description: Reconstruye todo lo que hizo una misma petición
     *     responses:
     *       200:
     *         description: Líneas de bitácora, de la más reciente a la más antigua
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 data:
     *                   type: array
     *                   items:
     *                     type: object
     *                     properties:
     *                       id: { type: integer }
     *                       entity: { type: string }
     *                       entityId: { type: string, nullable: true }
     *                       action: { type: string }
     *                       changedBy: { type: string }
     *                       changedAt: { type: string, format: date-time }
     *                       requestId: { type: string, nullable: true }
     *                       changes: { type: object, nullable: true }
     *                 total: { type: integer }
     *                 page: { type: integer }
     *                 limit: { type: integer }
     *                 pages: { type: integer }
     *       401:
     *         description: Unauthorized
     */
    app.get(
      "/audit",
      this.jwtPlugin.middleware,
      validateQuery(auditQuerySchema),
      this.auditController.getAll.bind(this.auditController)
    );
  }
}
