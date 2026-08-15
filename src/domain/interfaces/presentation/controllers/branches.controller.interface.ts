// src/domain/interfaces/controllers/branches.controller.interface.ts

import type { NextFunction, Request, Response } from "express";
import type { ICrudController } from "../../../../presentation/controllers/crud.controller";

/** El CRUD estándar más la baja física y la restauración. */
export interface IBranchesController extends ICrudController {
  hardDelete(req: Request, res: Response, next: NextFunction): Promise<void>;
  restore(req: Request, res: Response, next: NextFunction): Promise<void>;
}
