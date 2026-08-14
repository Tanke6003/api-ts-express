// src/domain/interfaces/presentation/controllers/branches.controller.interface.ts
import { Request, Response, NextFunction } from "express";

export interface IBranchesController {
  getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
  getById(req: Request, res: Response, next: NextFunction): Promise<void>;
  create(req: Request, res: Response, next: NextFunction): Promise<void>;
  update(req: Request, res: Response, next: NextFunction): Promise<void>;
  /** Borrado lógico. */
  softDelete(req: Request, res: Response, next: NextFunction): Promise<void>;
  /** Borrado físico. */
  hardDelete(req: Request, res: Response, next: NextFunction): Promise<void>;
  restore(req: Request, res: Response, next: NextFunction): Promise<void>;
}
