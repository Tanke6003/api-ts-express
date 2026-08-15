// src/presentation/controllers/branches.controller.ts
import type { NextFunction, Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import type { IBranchesService } from "../../domain/interfaces/application/services/branches.service.interface";
import type { IBranchesController } from "../../domain/interfaces/presentation/controllers/branches.controller.interface";
import type { IRequestContext } from "../../domain/interfaces/infrastructure/plugins/request-context.plugin.interface";
import {
  branchQuerySchema,
  createBranchSchema,
  updateBranchSchema,
} from "../../application/validators/branches.validators";
import { AppError } from "../../core/errors/app-error";
import { parseId } from "../utils/parse-id";
import { CrudController } from "./crud.controller";
import { ApiController, Delete, Post } from "../routing/route.decorators";
import { Crud } from "../routing/crud.decorator";
import { TOKENS } from "../../core/di/tokens";

const ID_PARAM = { id: "integer" } as const;

/**
 * Sucursales: el CRUD estándar más dos verbos propios.
 *
 * Los cinco de siempre vienen de `CrudController` y `@Crud`; aquí sólo se
 * escriben la baja física y la restauración, que ningún CRUD genérico tiene.
 */
@injectable()
@ApiController("/branches", { tag: "Branches", token: TOKENS.IBranchesController })
@Crud({
  resource: "la sucursal",
  dto: "Branch",
  schemas: { create: createBranchSchema, update: updateBranchSchema, query: branchQuerySchema },
})
export class BranchesController extends CrudController implements IBranchesController {
  constructor(
    @inject(TOKENS.IBranchesService) private readonly branches: IBranchesService,
    @inject(TOKENS.IRequestContext) context: IRequestContext
  ) {
    super(branches, context, "la sucursal");
  }

  @Delete("/:id/hard", {
    summary: "Baja física de una sucursal",
    description:
      "Borra la fila de la base. Antes elimina las citas que la referencian por clave foránea, todo dentro de la misma transacción.",
    params: ID_PARAM,
    responses: { 204: "Sucursal eliminada", 404: "Sucursal no encontrada" },
  })
  public hardDelete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.branches.hardDelete(parseId(req.params.id, "la sucursal"));
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  @Post("/:id/restore", {
    summary: "Revierte la baja lógica de una sucursal",
    params: ID_PARAM,
    responses: { 200: "Sucursal restaurada", 404: "Sucursal no encontrada o ya activa" },
  })
  public restore = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const restored = await this.branches.restore(parseId(req.params.id, "la sucursal"));
      if (!restored) throw new AppError("Branch not found or already active", 404);

      res.json({ status: "ok", message: "Branch restored" });
    } catch (error) {
      next(error);
    }
  };
}
