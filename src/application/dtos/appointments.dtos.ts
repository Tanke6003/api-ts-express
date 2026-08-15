// src/application/dtos/appointments.dtos.ts
import { z } from "zod";
import { APPOINTMENT_STATUSES, type AppointmentStatus } from "../../domain/models/appointments.model";
import { defineDto, definePagedDto } from "./dto.registry";

export const appointmentDto = defineDto(
  "Appointment",
  z.object({
    id: z.int().meta({ examples: [1] }),
    branchId: z.int().meta({ examples: [1] }),
    branchName: z.string().nullable().meta({
      description: "Resuelto en el servicio (Include de la sucursal).",
      examples: ["Sucursal Centro"],
    }),
    clientId: z.int().nullable().meta({
      description: "Null cuando la cita no es de un cliente registrado.",
      examples: [3],
    }),
    clientName: z.string().nullable().meta({
      description: "Resuelto en el servicio (Include del cliente).",
      examples: ["Alice Johnson"],
    }),
    guestName: z.string().nullable().meta({
      description: "Nombre con el que se agendó cuando no hay cliente registrado.",
      examples: ["Carlos Méndez (walk-in)"],
    }),
    displayName: z.string().meta({
      description: "Con quién es la cita, venga de un cliente registrado o no.",
      examples: ["Alice Johnson"],
    }),
    scheduledAt: z.string().meta({ format: "date-time" }),
    durationMin: z.int().meta({ examples: [30] }),
    status: z.enum(APPOINTMENT_STATUSES),
    details: z.string().nullable(),
    available: z.boolean().optional(),
  })
);

export const paginatedAppointmentsDto = definePagedDto("PaginatedAppointments", appointmentDto);

export const appointmentStatsDto = defineDto(
  "AppointmentStats",
  z.object({
    data: z.array(
      z.object({
        status: z.enum(APPOINTMENT_STATUSES),
        total: z.int(),
      })
    ),
  })
);

export type AppointmentDTO = z.infer<typeof appointmentDto>;

export interface CreateAppointmentDTO {
  branchId: number;
  /** Omitir (o null) para una cita sin cliente registrado. */
  clientId?: number | null;
  /** Obligatorio si no hay `clientId`. */
  guestName?: string | null;
  scheduledAt: string;
  durationMin?: number;
  status?: AppointmentStatus;
  details?: string | null;
}

export type UpdateAppointmentDTO = Partial<CreateAppointmentDTO>;

/** Filtros de la consulta de citas; se combinan entre sí con AND. */
export interface AppointmentQueryDTO {
  page: number;
  limit: number;
  branchId?: number;
  clientId?: number;
  status?: AppointmentStatus;
  /** Desde (ISO). Acota `scheduledAt`. */
  from?: string;
  /** Hasta (ISO). Acota `scheduledAt`. */
  to?: string;
  /** Busca en los detalles y en el nombre del invitado. */
  search?: string;
  /** `true` para incluir también las citas eliminadas lógicamente. */
  withDeleted?: boolean;
  /** `true` para ver sólo las citas sin cliente registrado. */
  onlyGuests?: boolean;
}
