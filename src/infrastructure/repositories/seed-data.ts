// src/infrastructure/repositories/seed-data.ts
import type { IUser } from "../../domain/models/users.model";
import type { IBranch } from "../../domain/models/branches.model";
import type { IAppointment } from "../../domain/models/appointments.model";

/**
 * Datos iniciales del modo en memoria (`DATA_SOURCE` distinto de `oracle`).
 *
 * Son un espejo de docker/oracle/sql/02_seed.sql: mismas filas y, por tanto,
 * mismas PKs, para que la interfaz web se vea igual con o sin Oracle levantado.
 */

const hoursFromNow = (hours: number): Date => new Date(Date.now() + hours * 60 * 60 * 1000);

export const USERS_SEED: Partial<IUser>[] = [
  { name: "John Doe", email: "john@example.com", phone: "+52 55 1111 1111", isClient: true },
  { name: "Jane Smith", email: "jane@example.com", phone: "+52 55 2222 2222", isClient: true },
  { name: "Alice Johnson", email: "alice@example.com", phone: "+52 55 3333 3333", isClient: true },
  { name: "Bob Brown", email: "bob@example.com", phone: "+52 55 4444 4444", isClient: false },
];

export const BRANCHES_SEED: Partial<IBranch>[] = [
  {
    name: "Sucursal Centro",
    address: "Av. Juárez 100, Centro",
    phone: "+52 55 5000 0001",
    opensAt: "09:00",
    closesAt: "19:00",
  },
  {
    name: "Sucursal Norte",
    address: "Blvd. Norte 2450, Lindavista",
    phone: "+52 55 5000 0002",
    opensAt: "10:00",
    closesAt: "20:00",
  },
  {
    name: "Sucursal Sur",
    address: "Calz. del Hueso 88, Coapa",
    phone: "+52 55 5000 0003",
    opensAt: "08:00",
    closesAt: "17:00",
  },
];

export const APPOINTMENTS_SEED: Partial<IAppointment>[] = [
  {
    fkBranch: 1,
    fkClient: 1,
    guestName: null,
    scheduledAt: hoursFromNow(24),
    durationMin: 45,
    status: "CONFIRMED",
    details: "Revisión general y cotización.",
  },
  {
    fkBranch: 2,
    fkClient: 2,
    guestName: null,
    scheduledAt: hoursFromNow(48),
    durationMin: 30,
    status: "PENDING",
    details: "Seguimiento del contrato 8891.",
  },
  // Citas sin cliente registrado: sólo tenemos el nombre con el que se agendó.
  {
    fkBranch: 1,
    fkClient: null,
    guestName: "Carlos Méndez (walk-in)",
    scheduledAt: hoursFromNow(3),
    durationMin: 20,
    status: "PENDING",
    details: "Llegó sin cita, pidió informes.",
  },
  {
    fkBranch: 3,
    fkClient: null,
    guestName: "Prospecto telefónico",
    scheduledAt: hoursFromNow(120),
    durationMin: 60,
    status: "PENDING",
    details: "Cita agendada por teléfono, aún sin alta como cliente.",
  },
];
