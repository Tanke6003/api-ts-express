// src/presentation/routes/branches.route.ts
import { container } from "tsyringe";
import type { Router } from "express";
import { ITokenPlugin } from "../../domain/interfaces/infrastructure/plugins/token.plugin.interface";
import { IBranchesController } from "../../domain/interfaces/presentation/controllers/branches.controller.interface";
import { validateBody, validateQuery } from "../middlewares/validate.middleware";
import {
  branchQuerySchema,
  createBranchSchema,
  updateBranchSchema,
} from "../../application/validators/branches.validators";
import { TOKENS } from "../../core/di/tokens";

export class BranchesRoutes {
  private branchesController: IBranchesController;
  private jwtPlugin: ITokenPlugin;

  constructor() {
    this.branchesController = container.resolve<IBranchesController>(TOKENS.IBranchesController);
    this.jwtPlugin = container.resolve<ITokenPlugin>(TOKENS.ITokenPlugin);
  }

  public register(app: Router) {
    /**
     * @openapi
     * /api/branches:
     *   get:
     *     tags:
     *       - Branches
     *     summary: Listado paginado de sucursales
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
     *           default: 10
     *       - in: query
     *         name: search
     *         schema:
     *           type: string
     *         description: Busca en el nombre y la dirección
     *       - in: query
     *         name: withDeleted
     *         schema:
     *           type: string
     *           enum: ["true", "false"]
     *         description: Incluye las sucursales dadas de baja lógicamente
     *     responses:
     *       200:
     *         description: Sucursales encontradas
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/PaginatedBranches'
     *       401:
     *         description: Unauthorized
     */
    app.get(
      "/branches",
      this.jwtPlugin.middleware,
      validateQuery(branchQuerySchema),
      this.branchesController.getAll.bind(this.branchesController)
    );

    /**
     * @openapi
     * /api/branches/{id}:
     *   get:
     *     tags:
     *       - Branches
     *     summary: Obtiene una sucursal por id
     *     security:
     *       - bearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: integer
     *     responses:
     *       200:
     *         description: Sucursal encontrada
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Branch'
     *       404:
     *         description: Sucursal no encontrada
     */
    app.get(
      "/branches/:id",
      this.jwtPlugin.middleware,
      this.branchesController.getById.bind(this.branchesController)
    );

    /**
     * @openapi
     * /api/branches:
     *   post:
     *     tags:
     *       - Branches
     *     summary: Crea una sucursal
     *     security:
     *       - bearerAuth: []
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [name]
     *             properties:
     *               name:
     *                 type: string
     *                 example: Sucursal Centro
     *               address:
     *                 type: string
     *                 example: Av. Juárez 100, Centro
     *               phone:
     *                 type: string
     *                 example: "+52 55 5000 0001"
     *               opensAt:
     *                 type: string
     *                 example: "09:00"
     *               closesAt:
     *                 type: string
     *                 example: "19:00"
     *     responses:
     *       201:
     *         description: Sucursal creada
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Branch'
     *       400:
     *         description: Error de validación
     */
    app.post(
      "/branches",
      this.jwtPlugin.middleware,
      validateBody(createBranchSchema),
      this.branchesController.create.bind(this.branchesController)
    );

    /**
     * @openapi
     * /api/branches/{id}:
     *   put:
     *     tags:
     *       - Branches
     *     summary: Actualiza una sucursal
     *     security:
     *       - bearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: integer
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               name:
     *                 type: string
     *               address:
     *                 type: string
     *               phone:
     *                 type: string
     *               opensAt:
     *                 type: string
     *               closesAt:
     *                 type: string
     *     responses:
     *       200:
     *         description: Sucursal actualizada
     *       404:
     *         description: Sucursal no encontrada
     */
    app.put(
      "/branches/:id",
      this.jwtPlugin.middleware,
      validateBody(updateBranchSchema),
      this.branchesController.update.bind(this.branchesController)
    );

    /**
     * @openapi
     * /api/branches/{id}:
     *   delete:
     *     tags:
     *       - Branches
     *     summary: Baja lógica de una sucursal
     *     description: >
     *       Marca la sucursal como no disponible y cancela, en la misma
     *       transacción, sus citas futuras que siguieran vigentes.
     *     security:
     *       - bearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: integer
     *     responses:
     *       204:
     *         description: Sucursal dada de baja
     *       404:
     *         description: Sucursal no encontrada
     */
    app.delete(
      "/branches/:id",
      this.jwtPlugin.middleware,
      this.branchesController.softDelete.bind(this.branchesController)
    );

    /**
     * @openapi
     * /api/branches/{id}/hard:
     *   delete:
     *     tags:
     *       - Branches
     *     summary: Baja física de una sucursal
     *     description: >
     *       Borra la fila de la base. Antes elimina las citas que la referencian
     *       por clave foránea, todo dentro de la misma transacción.
     *     security:
     *       - bearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: integer
     *     responses:
     *       204:
     *         description: Sucursal eliminada
     *       404:
     *         description: Sucursal no encontrada
     */
    app.delete(
      "/branches/:id/hard",
      this.jwtPlugin.middleware,
      this.branchesController.hardDelete.bind(this.branchesController)
    );

    /**
     * @openapi
     * /api/branches/{id}/restore:
     *   post:
     *     tags:
     *       - Branches
     *     summary: Revierte la baja lógica de una sucursal
     *     security:
     *       - bearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: integer
     *     responses:
     *       200:
     *         description: Sucursal restaurada
     *       404:
     *         description: Sucursal no encontrada o ya activa
     */
    app.post(
      "/branches/:id/restore",
      this.jwtPlugin.middleware,
      this.branchesController.restore.bind(this.branchesController)
    );
  }
}
