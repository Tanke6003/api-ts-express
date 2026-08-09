// src/presentation/controllers/branches.controller.ts
import { Request, Response, NextFunction } from "express";
import { inject, injectable } from "tsyringe";
import type { IBranchesService } from "../../domain/interfaces/application/services/branches.service.interface";
import { IBranchesController } from "../../domain/interfaces/presentation/controllers/branches.controller.interface";
import type { BranchQueryInput } from "../../application/validators/branches.validators";
import { AppError } from "../../core/errors/app-error";
import { parseId } from "./parse-id";

@injectable()
export class BranchesController implements IBranchesController {
  constructor(
    @inject("IBranchesService") private readonly branchesService: IBranchesService
  ) {}

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

  public getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const branch = await this.branchesService.getById(parseId(req.params.id, "branch"));
      if (!branch) throw new AppError("Branch not found", 404);
      res.json(branch);
    } catch (err) {
      next(err);
    }
  };

  public create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const created = await this.branchesService.create(req.body);
      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  };

  public update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const updated = await this.branchesService.update(parseId(req.params.id, "branch"), req.body);
      if (!updated) throw new AppError("Branch not found", 404);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  };

  public softDelete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const deleted = await this.branchesService.softDelete(parseId(req.params.id, "branch"));
      if (!deleted) throw new AppError("Branch not found", 404);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };

  public hardDelete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.branchesService.hardDelete(parseId(req.params.id, "branch"));
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };

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
