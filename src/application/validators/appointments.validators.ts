import { z } from "zod";
import { APPOINTMENT_STATUSES } from "../../domain/models/appointments.model";

const queryBoolean = z
  .string()
  .optional()
  .transform((value) => value === "true");

const isoDateTime = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "La fecha no es válida");

/**
 * Forma base de una cita. Se declara aparte del `refine` porque un `ZodEffects`
 * ya no expone `.partial()`, que es lo que necesita el esquema de actualización.
 */
export const appointmentShapeSchema = z.object({
  branchId: z.coerce.number().int().positive("La sucursal es obligatoria"),
  /** `null` u omitido para una cita sin cliente registrado. */
  clientId: z.coerce.number().int().positive().nullish(),
  guestName: z.string().trim().min(1).max(100).nullish(),
  scheduledAt: isoDateTime,
  durationMin: z.coerce.number().int().min(5).max(1440).optional(),
  status: z.enum(APPOINTMENT_STATUSES).optional(),
  details: z.string().max(500, "El detalle es demasiado largo").nullish(),
});

export const createAppointmentSchema = appointmentShapeSchema.refine(
  (value) => value.clientId != null || (value.guestName ?? "").trim().length > 0,
  {
    message: "Indica un cliente registrado o el nombre con el que se agenda la cita",
    path: ["guestName"],
  }
);

/**
 * En la actualización no se puede validar aquí la regla "cliente o invitado":
 * un PATCH parcial puede no traer ninguno de los dos campos y aun así ser
 * válido. Esa comprobación se hace en el servicio, sobre la cita ya combinada.
 */
export const updateAppointmentSchema = appointmentShapeSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "No hay nada que actualizar");

export const appointmentQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((value) => (value ? parseInt(value, 10) : 1))
    .pipe(z.number().int().min(1, "page must be >= 1")),
  limit: z
    .string()
    .optional()
    .transform((value) => (value ? parseInt(value, 10) : 10))
    .pipe(z.number().int().min(1).max(100, "limit must be <= 100")),
  branchId: z.coerce.number().int().positive().optional(),
  clientId: z.coerce.number().int().positive().optional(),
  status: z.enum(APPOINTMENT_STATUSES).optional(),
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
  search: z.string().trim().min(1).max(100).optional(),
  withDeleted: queryBoolean,
  onlyGuests: queryBoolean,
});

export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;
export type AppointmentQueryInput = z.infer<typeof appointmentQuerySchema>;
