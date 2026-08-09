// src/domain/interfaces/presentation/controllers/appointments.controller.interface.ts
import { Request, Response, NextFunction } from "express";

export interface IAppointmentsController {
  getAll(req: Request, res: Response, next: NextFunction): Promise<void>;
  getById(req: Request, res: Response, next: NextFunction): Promise<void>;
  create(req: Request, res: Response, next: NextFunction): Promise<void>;
  update(req: Request, res: Response, next: NextFunction): Promise<void>;
  /** Borrado lógico. */
  softDelete(req: Request, res: Response, next: NextFunction): Promise<void>;
  /** Borrado físico. */
  hardDelete(req: Request, res: Response, next: NextFunction): Promise<void>;
  restore(req: Request, res: Response, next: NextFunction): Promise<void>;
  /** Totales por estado. */
  getStats(req: Request, res: Response, next: NextFunction): Promise<void>;
}
