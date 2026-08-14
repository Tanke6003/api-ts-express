// src/presentation/controllers/appointments.controller.ts
import { Request, Response, NextFunction } from "express";
import { inject, injectable } from "tsyringe";
import type { IAppointmentsService } from "../../domain/interfaces/application/services/appointments.service.interface";
import { IAppointmentsController } from "../../domain/interfaces/presentation/controllers/appointments.controller.interface";
import type { AppointmentQueryInput } from "../../application/validators/appointments.validators";
import { AppError } from "../../core/errors/app-error";
import { parseId } from "../utils/parse-id";
import { BaseController } from "./base.controller";
import type { IRequestContext } from "../../domain/interfaces/infrastructure/plugins/request-context.plugin.interface";
import { TOKENS } from "../../core/di/tokens";
import {
  appointmentQuerySchema,
  createAppointmentSchema,
  updateAppointmentSchema,
} from "../../application/validators/appointments.validators";
import { ApiController, Delete, Get, Post, Put } from "../routing/route.decorators";

const ID_PARAM = { id: "integer" } as const;

@injectable()
@ApiController("/appointments", { tag: "Appointments", token: TOKENS.IAppointmentsController })
export class AppointmentsController extends BaseController implements IAppointmentsController {
  constructor(
    @inject(TOKENS.IAppointmentsService) private readonly appointmentsService: IAppointmentsService,
    @inject(TOKENS.IRequestContext) context: IRequestContext
  ) {
    super(context);
  }

  @Get("/", {
    summary: "Listado paginado de citas",
    description:
      "Todos los filtros se combinan con AND en una sola consulta. Cada cita llega con el nombre de su sucursal y, si es de un cliente registrado, el nombre del cliente.",
    query: appointmentQuerySchema,
    responses: { 200: { description: "Citas encontradas", ref: "PaginatedAppointments" } },
  })
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

  @Get("/stats", {
    summary: "Totales de citas por estado",
    responses: { 200: { description: "Totales por estado", ref: "AppointmentStats" } },
  })
  public getStats = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const raw = req.query.branchId;
      const branchId = raw === undefined ? undefined : parseId(String(raw), "branch");
      res.json({ data: await this.appointmentsService.getStats(branchId) });
    } catch (err) {
      next(err);
    }
  };

  @Get("/:id", {
    summary: "Obtiene una cita por id",
    params: ID_PARAM,
    responses: {
      200: { description: "Cita encontrada", ref: "Appointment" },
      404: "Cita no encontrada",
    },
  })
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

  @Post("/", {
    summary: "Agenda una cita",
    description:
      "La cita puede ser de un cliente registrado (`clientId`) o de alguien que aún no lo está, en cuyo caso hay que mandar `guestName`. Se rechaza si la sucursal no existe, si la fecha ya pasó o si el horario se solapa con otra cita de la misma sucursal.",
    body: createAppointmentSchema,
    responses: {
      201: { description: "Cita creada", ref: "Appointment" },
      400: "Error de validación o regla de negocio",
      409: "La sucursal ya tiene una cita en ese horario",
    },
  })
  public create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const created = await this.appointmentsService.create(req.body);
      res.status(201).json(created);
    } catch (err) {
      next(err);
    }
  };

  @Put("/:id", {
    summary: "Actualiza o reagenda una cita",
    params: ID_PARAM,
    body: updateAppointmentSchema,
    responses: {
      200: { description: "Cita actualizada", ref: "Appointment" },
      404: "Cita no encontrada",
      409: "La sucursal ya tiene una cita en ese horario",
    },
  })
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

  @Delete("/:id", {
    summary: "Baja lógica de una cita",
    params: ID_PARAM,
    responses: { 204: "Cita dada de baja", 404: "Cita no encontrada" },
  })
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

  @Delete("/:id/hard", {
    summary: "Baja física de una cita",
    params: ID_PARAM,
    responses: { 204: "Cita eliminada", 404: "Cita no encontrada" },
  })
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

  @Post("/:id/restore", {
    summary: "Revierte la baja lógica de una cita",
    params: ID_PARAM,
    responses: { 200: "Cita restaurada", 404: "Cita no encontrada o ya activa" },
  })
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
