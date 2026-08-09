// src/application/mapping/profiles.ts
import { createMapper } from "./mapper";
import type { IUser } from "../../domain/models/users.model";
import type { IBranch } from "../../domain/models/branches.model";
import type { IAppointment } from "../../domain/models/appointments.model";
import type { UserDTO } from "../dtos/users.dtos";
import type { BranchDTO } from "../dtos/branches.dtos";
import type { AppointmentDTO } from "../dtos/appointments.dtos";

/**
 * Perfiles de mapeo del proyecto, todos en un sitio. Es el equivalente de los
 * `Profile` de AutoMapper: los servicios ya no escriben `toDTO`/`toModel`.
 */

/** `null` en vez de `undefined`: en la respuesta JSON un campo ausente confunde. */
const nullable = <T>(value: unknown): T | null => (value ?? null) as T | null;

export const userMapper = createMapper<IUser, UserDTO>({
  // La PK nunca viene del cuerpo de la petición.
  id: { field: "pkUser", readOnly: true },
  name: "name",
  email: { field: "email", to: nullable, from: (value) => value ?? null },
  phone: { field: "phone", to: nullable, from: (value) => value ?? null },
  // Los drivers sin esa columna no distinguen staff de clientes: se asume
  // cliente para no bloquear el agendado.
  isClient: { field: "isClient", to: (value) => (value ?? true) as boolean, from: (value) => value ?? true },
});

export const branchMapper = createMapper<IBranch, BranchDTO>({
  id: { field: "pkBranch", readOnly: true },
  name: "name",
  address: { field: "address", to: nullable, from: (value) => value ?? null },
  phone: { field: "phone", to: nullable, from: (value) => value ?? null },
  opensAt: "opensAt",
  closesAt: "closesAt",
  // Estado del borrado lógico: se lee, no se escribe desde el DTO.
  available: { field: "available", readOnly: true },
});

/**
 * La cita sin los nombres de sucursal y cliente: ésos no salen de la entidad
 * sino de las relaciones que resuelve el servicio (`loadRelated`), así que se
 * añaden después de mapear.
 */
export type AppointmentEntityDTO = Omit<
  AppointmentDTO,
  "branchName" | "clientName" | "displayName"
>;

export const appointmentMapper = createMapper<IAppointment, AppointmentEntityDTO>({
  id: { field: "pkAppointment", readOnly: true },
  branchId: "fkBranch",
  clientId: { field: "fkClient", to: nullable },
  guestName: { field: "guestName", to: nullable },
  scheduledAt: {
    field: "scheduledAt",
    // Hacia fuera siempre ISO; hacia dentro, Date, que es lo que espera la base.
    to: (value) => new Date(value as Date).toISOString(),
    from: (value) => new Date(value as string),
  },
  durationMin: "durationMin",
  status: "status",
  details: { field: "details", to: nullable, from: (value) => value ?? null },
  available: { field: "available", readOnly: true },
});
