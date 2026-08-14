// src/presentation/controllers/branches.controller.ts
import { Request, Response, NextFunction } from "express";
import { inject, injectable } from "tsyringe";
import type { IBranchesService } from "../../domain/interfaces/application/services/branches.service.interface";
import { IBranchesController } from "../../domain/interfaces/presentation/controllers/branches.controller.interface";
import type { BranchQueryInput } from "../../application/validators/branches.validators";
import { AppError } from "../../core/errors/app-error";
import { parseId } from "../utils/parse-id";
import { BaseController } from "./base.controller";
import type { IRequestContext } from "../../domain/interfaces/infrastructure/plugins/request-context.plugin.interface";
import { TOKENS } from "../../core/di/tokens";
import {
  branchQuerySchema,
  createBranchSchema,
  updateBranchSchema,
} from "../../application/validators/branches.validators";
import { ApiController, Delete, Get, Post, Put } from "../routing/route.decorators";

const ID_PARAM = { id: "integer" } as const;

@injectable()
@ApiController("/branches", { tag: "Branches", token: TOKENS.IBranchesController })
export class BranchesController extends BaseController implements IBranchesController {
  constructor(
    @inject(TOKENS.IBranchesService) private readonly branchesService: IBranchesService,
    @inject(TOKENS.IRequestContext) context: IRequestContext
  ) {
    super(context);
  }

  @Get("/", {
    summary: "Listado paginado de sucursales",
    query: branchQuerySchema,
    responses: { 200: { description: "Sucursales encontradas", ref: "PaginatedBranches" } },
  })
  public getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = (req.validatedQuery as BranchQueryInput | undefined) ?? {
        page: 1,
        limit: 10,
        withDeleted: false,
      };
      res.json(await this.branchesService.getAll(query));
    } catch (err) {
      next(err);
    }
  };

  @Get("/:id", {
    summary: "Obtiene una sucursal por id",
    params: ID_PARAM,
    responses: {
      200: { description: "Sucursal encontrada", ref: "Branch" },
      404: "Sucursal no encontrada",
    },
  })
  public getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const branch = await this.branchesService.getById(parseId(req.params.id, "branch"));
      if (!branch) throw new AppError("Branch not found", 404);
      res.json(branch);
    } catch (err) {
      next(err);
    }
  };

  @Post("/", {
    summary: "Crea una sucursal",
    body: createBranchSchema,
    responses: {
      201: { description: "Sucursal creada", ref: "Branch" },
      400: "Error de validación",
    },
  })
  public create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const created = await this.branchesService.create(req.body);
      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  };

  @Put("/:id", {
    summary: "Actualiza una sucursal",
    params: ID_PARAM,
    body: updateBranchSchema,
    responses: {
      200: { description: "Sucursal actualizada", ref: "Branch" },
      404: "Sucursal no encontrada",
    },
  })
  public update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const updated = await this.branchesService.update(parseId(req.params.id, "branch"), req.body);
      if (!updated) throw new AppError("Branch not found", 404);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  };

  @Delete("/:id", {
    summary: "Baja lógica de una sucursal",
    description:
      "Marca la sucursal como no disponible y cancela, en la misma transacción, sus citas futuras que siguieran vigentes.",
    params: ID_PARAM,
    responses: { 204: "Sucursal dada de baja", 404: "Sucursal no encontrada" },
  })
  public softDelete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const deleted = await this.branchesService.softDelete(parseId(req.params.id, "branch"));
      if (!deleted) throw new AppError("Branch not found", 404);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };

  @Delete("/:id/hard", {
    summary: "Baja física de una sucursal",
    description:
      "Borra la fila de la base. Antes elimina las citas que la referencian por clave foránea, todo dentro de la misma transacción.",
    params: ID_PARAM,
    responses: { 204: "Sucursal eliminada", 404: "Sucursal no encontrada" },
  })
  public hardDelete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.branchesService.hardDelete(parseId(req.params.id, "branch"));
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };

  @Post("/:id/restore", {
    summary: "Revierte la baja lógica de una sucursal",
    params: ID_PARAM,
    responses: { 200: "Sucursal restaurada", 404: "Sucursal no encontrada o ya activa" },
  })
  public restore = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const restored = await this.branchesService.restore(parseId(req.params.id, "branch"));
      if (!restored) throw new AppError("Branch not found or already active", 404);
      res.json({ status: "ok", message: "Branch restored" });
    } catch (err) {
      next(err);
    }
  };
}
