// src/presentation/controllers/appointments.controller.ts
import { Request, Response, NextFunction } from "express";
import { inject, injectable } from "tsyringe";
import type { IAppointmentsService } from "../../domain/interfaces/application/services/appointments.service.interface";
import { IAppointmentsController } from "../../domain/interfaces/presentation/controllers/appointments.controller.interface";
import type { AppointmentQueryInput } from "../../application/validators/appointments.validators";
import { AppError } from "../../core/errors/app-error";
import { parseId } from "./parse-id";
import { BaseController } from "./base.controller";
import type { IRequestContext } from "../../domain/interfaces/infrastructure/plugins/request-context.plugin.interface";

@injectable()
export class AppointmentsController extends BaseController implements IAppointmentsController {
  constructor(
    @inject("IAppointmentsService") private readonly appointmentsService: IAppointmentsService,
    @inject("IRequestContext") context: IRequestContext
  ) {
    super(context);
  }

  public getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = (req.validatedQuery as AppointmentQueryInput | undefined) ?? {
        page: 1,
        limit: 10,
        withDeleted: false,
        onlyGuests: false,
      };
      res.json(await this.appointmentsService.getAll(query));
    } catch (err) {
      next(err);
    }
  };

  public getStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const raw = req.query.branchId;
      const branchId = raw === undefined ? undefined : parseId(String(raw), "branch");
      res.json({ data: await this.appointmentsService.getStats(branchId) });
    } catch (err) {
      next(err);
    }
  };

  public getById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const appointment = await this.appointmentsService.getById(
        parseId(req.params.id, "appointment")
      );
      if (!appointment) throw new AppError("Appointment not found", 404);
      res.json(appointment);
    } catch (err) {
      next(err);
    }
  };

  public create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const created = await this.appointmentsService.create(req.body);
      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  };

  public update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const updated = await this.appointmentsService.update(
        parseId(req.params.id, "appointment"),
        req.body
      );
      if (!updated) throw new AppError("Appointment not found", 404);
      res.json(updated);
    } catch (err) {
      next(err);
    }
  };

  public softDelete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const deleted = await this.appointmentsService.softDelete(
        parseId(req.params.id, "appointment")
      );
      if (!deleted) throw new AppError("Appointment not found", 404);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };

  public hardDelete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const deleted = await this.appointmentsService.hardDelete(
        parseId(req.params.id, "appointment")
      );
      if (!deleted) throw new AppError("Appointment not found", 404);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };

  public restore = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const restored = await this.appointmentsService.restore(
        parseId(req.params.id, "appointment")
      );
      if (!restored) throw new AppError("Appointment not found or already active", 404);
      res.json({ status: "ok", message: "Appointment restored" });
    } catch (err) {
      next(err);
    }
  };
}
