// src/presentation/controllers/appointments.controller.ts
import type { NextFunction, Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import type { IAppointmentsService } from "../../domain/interfaces/application/services/appointments.service.interface";
import type { IAppointmentsController } from "../../domain/interfaces/presentation/controllers/appointments.controller.interface";
import type { IRequestContext } from "../../domain/interfaces/infrastructure/plugins/request-context.plugin.interface";
import {
  appointmentQuerySchema,
  createAppointmentSchema,
  updateAppointmentSchema,
} from "../../application/validators/appointments.validators";
import { AppError } from "../../core/errors/app-error";
import { parseId } from "../utils/parse-id";
import { CrudController } from "./crud.controller";
import { ApiController, Delete, Get, Post } from "../routing/route.decorators";
import { Crud } from "../routing/crud.decorator";
import { TOKENS } from "../../core/di/tokens";

const ID_PARAM = { id: "integer" } as const;

/**
 * Citas.
 *
 * El servicio es todo suyo —cada lectura resuelve relaciones y cada escritura
 * tiene reglas—, pero el controlador no: parsear el id, devolver 404 y delegar
 * el error es lo mismo aquí que en cualquier módulo, así que viene de la base.
 * Las dos bases son independientes: se puede tomar una sin la otra.
 */
@injectable()
@ApiController("/appointments", { tag: "Appointments", token: TOKENS.IAppointmentsController })
@Crud({
  resource: "la cita",
  dto: "Appointment",
  schemas: {
    create: createAppointmentSchema,
    update: updateAppointmentSchema,
    query: appointmentQuerySchema,
  },
})
export class AppointmentsController extends CrudController implements IAppointmentsController {
  constructor(
    @inject(TOKENS.IAppointmentsService) private readonly appointments: IAppointmentsService,
    @inject(TOKENS.IRequestContext) context: IRequestContext
  ) {
    super(appointments, context, "la cita");
  }

  @Get("/stats", {
    summary: "Totales de citas por estado",
    responses: { 200: { description: "Totales por estado", ref: "AppointmentStats" } },
  })
  public getStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const raw = req.query.branchId;
      const branchId = raw === undefined ? undefined : parseId(String(raw), "la sucursal");

      res.json({ data: await this.appointments.getStats(branchId) });
    } catch (error) {
      next(error);
    }
  };

  @Delete("/:id/hard", {
    summary: "Baja física de una cita",
    params: ID_PARAM,
    responses: { 204: "Cita eliminada", 404: "Cita no encontrada" },
  })
  public hardDelete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const deleted = await this.appointments.hardDelete(parseId(req.params.id, "la cita"));
      if (!deleted) throw new AppError("Appointment not found", 404);

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };

  @Post("/:id/restore", {
    summary: "Revierte la baja lógica de una cita",
    params: ID_PARAM,
    responses: { 200: "Cita restaurada", 404: "Cita no encontrada o ya activa" },
  })
  public restore = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const restored = await this.appointments.restore(parseId(req.params.id, "la cita"));
      if (!restored) throw new AppError("Appointment not found or already active", 404);

      res.json({ status: "ok", message: "Appointment restored" });
    } catch (error) {
      next(error);
    }
  };
}
