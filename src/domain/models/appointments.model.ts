// src/domain/models/appointments.model.ts

export const APPOINTMENT_STATUSES = ["PENDING", "CONFIRMED", "DONE", "CANCELLED"] as const;

export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

/**
 * Cita agendada en una sucursal.
 *
 * Puede pertenecer a un cliente dado de alta (`fkClient`) o a alguien que aún no
 * lo está, en cuyo caso sólo guardamos el nombre con el que se agendó
 * (`guestName`). Al menos uno de los dos debe venir informado; la base lo
 * garantiza con el CHECK `CK_APPT_PARTY`.
 */
export interface IAppointment {
  pkAppointment: number;
  fkBranch: number;
  fkClient?: number | null;
  guestName?: string | null;
  scheduledAt: Date;
  durationMin: number;
  status: AppointmentStatus;
  details?: string | null;
  available?: boolean; // borrado lógico
  createdAt?: Date | null;
  updatedAt?: Date | null;
  /** Auditoria: la rellena el repositorio con el usuario del token. */
  createdBy?: string | null;
  updatedBy?: string | null;
}

/** Cita resuelta con los nombres de su sucursal y, si lo hay, de su cliente. */
export interface IAppointmentDetailed extends IAppointment {
  branchName: string | null;
  clientName: string | null;
}
