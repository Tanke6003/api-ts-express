// src/presentation/routes/appointments.route.ts
import { container } from "tsyringe";
import type { Router } from "express";
import { ITokenPlugin } from "../../domain/interfaces/infrastructure/plugins/token.plugin.interface";
import { IAppointmentsController } from "../../domain/interfaces/presentation/controllers/appointments.controller.interface";
import { validateBody, validateQuery } from "../middlewares/validate.middleware";
import {
  appointmentQuerySchema,
  createAppointmentSchema,
  updateAppointmentSchema,
} from "../../application/validators/appointments.validators";
import { TOKENS } from "../../core/di/tokens";

export class AppointmentsRoutes {
  private appointmentsController: IAppointmentsController;
  private jwtPlugin: ITokenPlugin;

  constructor() {
    this.appointmentsController =
      container.resolve<IAppointmentsController>(TOKENS.IAppointmentsController);
    this.jwtPlugin = container.resolve<ITokenPlugin>(TOKENS.ITokenPlugin);
  }

  public register(app: Router) {
    /**
     * @openapi
     * /api/appointments:
     *   get:
     *     tags:
     *       - Appointments
     *     summary: Listado paginado de citas
     *     description: >
     *       Todos los filtros se combinan con AND en una sola consulta. Cada cita
     *       llega con el nombre de su sucursal y, si es de un cliente registrado,
     *       el nombre del cliente.
     *     security:
     *       - bearerAuth: []
     *     parameters:
     *       - in: query
     *         name: page
     *         schema:
     *           type: integer
     *           default: 1
     *       - in: query
     *         name: limit
     *         schema:
     *           type: integer
     *           default: 10
     *       - in: query
     *         name: branchId
     *         schema:
     *           type: integer
     *       - in: query
     *         name: clientId
     *         schema:
     *           type: integer
     *       - in: query
     *         name: status
     *         schema:
     *           type: string
     *           enum: [PENDING, CONFIRMED, DONE, CANCELLED]
     *       - in: query
     *         name: from
     *         schema:
     *           type: string
     *           format: date-time
     *       - in: query
     *         name: to
     *         schema:
     *           type: string
     *           format: date-time
     *       - in: query
     *         name: search
     *         schema:
     *           type: string
     *         description: Busca en el detalle y en el nombre del invitado
     *       - in: query
     *         name: onlyGuests
     *         schema:
     *           type: string
     *           enum: ["true", "false"]
     *         description: Sólo citas sin cliente registrado
     *       - in: query
     *         name: withDeleted
     *         schema:
     *           type: string
     *           enum: ["true", "false"]
     *     responses:
     *       200:
     *         description: Citas encontradas
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/PaginatedAppointments'
     *       401:
     *         description: Unauthorized
     */
    app.get(
      "/appointments",
      this.jwtPlugin.middleware,
      validateQuery(appointmentQuerySchema),
      this.appointmentsController.getAll.bind(this.appointmentsController)
    );

    /**
     * @openapi
     * /api/appointments/stats:
     *   get:
     *     tags:
     *       - Appointments
     *     summary: Totales de citas por estado
     *     security:
     *       - bearerAuth: []
     *     parameters:
     *       - in: query
     *         name: branchId
     *         schema:
     *           type: integer
     *         description: Acota el conteo a una sucursal
     *     responses:
     *       200:
     *         description: Totales por estado
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/AppointmentStats'
     */
    // Antes que /appointments/:id, o "stats" se interpretaría como un id.
    app.get(
      "/appointments/stats",
      this.jwtPlugin.middleware,
      this.appointmentsController.getStats.bind(this.appointmentsController)
    );

    /**
     * @openapi
     * /api/appointments/{id}:
     *   get:
     *     tags:
     *       - Appointments
     *     summary: Obtiene una cita por id
     *     security:
     *       - bearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: integer
     *     responses:
     *       200:
     *         description: Cita encontrada
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Appointment'
     *       404:
     *         description: Cita no encontrada
     */
    app.get(
      "/appointments/:id",
      this.jwtPlugin.middleware,
      this.appointmentsController.getById.bind(this.appointmentsController)
    );

    /**
     * @openapi
     * /api/appointments:
     *   post:
     *     tags:
     *       - Appointments
     *     summary: Agenda una cita
     *     description: >
     *       La cita puede ser de un cliente registrado (`clientId`) o de alguien
     *       que aún no lo está, en cuyo caso hay que mandar `guestName`. Se
     *       rechaza si la sucursal no existe, si la fecha ya pasó o si el horario
     *       se solapa con otra cita de la misma sucursal.
     *     security:
     *       - bearerAuth: []
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required: [branchId, scheduledAt]
     *             properties:
     *               branchId:
     *                 type: integer
     *                 example: 1
     *               clientId:
     *                 type: integer
     *                 nullable: true
     *                 example: 2
     *               guestName:
     *                 type: string
     *                 nullable: true
     *                 example: Carlos Méndez (walk-in)
     *               scheduledAt:
     *                 type: string
     *                 format: date-time
     *               durationMin:
     *                 type: integer
     *                 default: 30
     *               status:
     *                 type: string
     *                 enum: [PENDING, CONFIRMED, DONE, CANCELLED]
     *               details:
     *                 type: string
     *     responses:
     *       201:
     *         description: Cita creada
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/Appointment'
     *       400:
     *         description: Error de validación o regla de negocio
     *       409:
     *         description: La sucursal ya tiene una cita en ese horario
     */
    app.post(
      "/appointments",
      this.jwtPlugin.middleware,
      validateBody(createAppointmentSchema),
      this.appointmentsController.create.bind(this.appointmentsController)
    );

    /**
     * @openapi
     * /api/appointments/{id}:
     *   put:
     *     tags:
     *       - Appointments
     *     summary: Actualiza o reagenda una cita
     *     security:
     *       - bearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: integer
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               branchId:
     *                 type: integer
     *               clientId:
     *                 type: integer
     *                 nullable: true
     *               guestName:
     *                 type: string
     *                 nullable: true
     *               scheduledAt:
     *                 type: string
     *                 format: date-time
     *               durationMin:
     *                 type: integer
     *               status:
     *                 type: string
     *                 enum: [PENDING, CONFIRMED, DONE, CANCELLED]
     *               details:
     *                 type: string
     *     responses:
     *       200:
     *         description: Cita actualizada
     *       404:
     *         description: Cita no encontrada
     *       409:
     *         description: La sucursal ya tiene una cita en ese horario
     */
    app.put(
      "/appointments/:id",
      this.jwtPlugin.middleware,
      validateBody(updateAppointmentSchema),
      this.appointmentsController.update.bind(this.appointmentsController)
    );

    /**
     * @openapi
     * /api/appointments/{id}:
     *   delete:
     *     tags:
     *       - Appointments
     *     summary: Baja lógica de una cita
     *     security:
     *       - bearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: integer
     *     responses:
     *       204:
     *         description: Cita dada de baja
     *       404:
     *         description: Cita no encontrada
     */
    app.delete(
      "/appointments/:id",
      this.jwtPlugin.middleware,
      this.appointmentsController.softDelete.bind(this.appointmentsController)
    );

    /**
     * @openapi
     * /api/appointments/{id}/hard:
     *   delete:
     *     tags:
     *       - Appointments
     *     summary: Baja física de una cita
     *     security:
     *       - bearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: integer
     *     responses:
     *       204:
     *         description: Cita eliminada
     *       404:
     *         description: Cita no encontrada
     */
    app.delete(
      "/appointments/:id/hard",
      this.jwtPlugin.middleware,
      this.appointmentsController.hardDelete.bind(this.appointmentsController)
    );

    /**
     * @openapi
     * /api/appointments/{id}/restore:
     *   post:
     *     tags:
     *       - Appointments
     *     summary: Revierte la baja lógica de una cita
     *     security:
     *       - bearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: integer
     *     responses:
     *       200:
     *         description: Cita restaurada
     *       404:
     *         description: Cita no encontrada o ya activa
     */
    app.post(
      "/appointments/:id/restore",
      this.jwtPlugin.middleware,
      this.appointmentsController.restore.bind(this.appointmentsController)
    );
  }
}
