import type { AppointmentStatus } from "../../domain/models/appointments.model";

/**
 * @openapi
 * components:
 *   schemas:
 *     Appointment:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         branchId:
 *           type: integer
 *           example: 1
 *         branchName:
 *           type: string
 *           nullable: true
 *           example: Sucursal Centro
 *         clientId:
 *           type: integer
 *           nullable: true
 *           description: Null cuando la cita no es de un cliente registrado
 *           example: 3
 *         clientName:
 *           type: string
 *           nullable: true
 *           example: Alice Johnson
 *         guestName:
 *           type: string
 *           nullable: true
 *           description: Nombre con el que se agendó cuando no hay cliente registrado
 *           example: Carlos Méndez (walk-in)
 *         displayName:
 *           type: string
 *           description: Nombre del cliente si lo hay, si no el del invitado
 *           example: Alice Johnson
 *         scheduledAt:
 *           type: string
 *           format: date-time
 *         durationMin:
 *           type: integer
 *           example: 30
 *         status:
 *           type: string
 *           enum: [PENDING, CONFIRMED, DONE, CANCELLED]
 *         details:
 *           type: string
 *           nullable: true
 *         available:
 *           type: boolean
 *     PaginatedAppointments:
 *       type: object
 *       properties:
 *         data:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Appointment'
 *         total:
 *           type: integer
 *         page:
 *           type: integer
 *         limit:
 *           type: integer
 *         pages:
 *           type: integer
 *     AppointmentStats:
 *       type: object
 *       properties:
 *         data:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *               total:
 *                 type: integer
 */
export interface AppointmentDTO {
  id: number;
  branchId: number;
  /** Resuelto en el servicio (Include de la sucursal). */
  branchName: string | null;
  clientId: number | null;
  /** Resuelto en el servicio (Include del cliente); null si es una cita sin cliente. */
  clientName: string | null;
  guestName: string | null;
  /** Con quién es la cita, venga de un cliente registrado o no. */
  displayName: string;
  scheduledAt: string;
  durationMin: number;
  status: AppointmentStatus;
  details: string | null;
  available?: boolean;
}

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
