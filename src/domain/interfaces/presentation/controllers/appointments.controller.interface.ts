// src/domain/interfaces/controllers/appointments.controller.interface.ts
import type { NextFunction, Request, Response } from "express";
import type { ICrudController } from "../../../../presentation/controllers/crud.controller";

/** El CRUD estándar más los tres verbos propios de una cita. */
export interface IAppointmentsController extends ICrudController {
  getStats(req: Request, res: Response, next: NextFunction): Promise<void>;
  hardDelete(req: Request, res: Response, next: NextFunction): Promise<void>;
  restore(req: Request, res: Response, next: NextFunction): Promise<void>;
}
