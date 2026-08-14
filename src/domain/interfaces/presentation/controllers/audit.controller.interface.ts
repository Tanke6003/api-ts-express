// src/domain/interfaces/presentation/controllers/audit.controller.interface.ts
import { Request, Response, NextFunction } from "express";

export interface IAuditController {
  /** Listado paginado de la bitácora, del cambio más reciente al más antiguo. */
  getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
}
