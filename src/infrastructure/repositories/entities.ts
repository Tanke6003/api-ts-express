// src/infrastructure/repositories/entities.ts
import { defineEntity } from "./base/entity-metadata";
import { ENTITY_NAMES } from "../../domain/models/entity-names";
import type { IUser } from "../../domain/models/users.model";
import type { IBranch } from "../../domain/models/branches.model";
import type { IAppointment } from "../../domain/models/appointments.model";

/**
 * Mapeo entidad <-> tabla de los tres módulos de ejemplo.
 *
 * Es el único sitio donde se nombran columnas: a partir de aquí, el repositorio
 * genérico produce todo el SQL. Cambiar el nombre físico de una columna es
 * cambiar una línea de este archivo.
 */

export const USERS_ENTITY = defineEntity<IUser>({
  table: ENTITY_NAMES.USERS,
  primaryKey: "pkUser",
  identity: true,
  columns: {
    pkUser: { name: "PK_USER", kind: "number", insertable: false, updatable: false },
    name: { name: "NAME", kind: "string" },
    email: { name: "EMAIL", kind: "string" },
    phone: { name: "PHONE", kind: "string" },
    isClient: { name: "IS_CLIENT", kind: "boolean" },
    available: { name: "AVAILABLE", kind: "boolean" },
    createdAt: { name: "CREATED_AT", kind: "date", updatable: false },
    updatedAt: { name: "UPDATED_AT", kind: "date" },
    createdBy: { name: "CREATED_BY", kind: "string", updatable: false },
    updatedBy: { name: "UPDATED_BY", kind: "string" },
  },
  softDelete: { property: "available", activeValue: 1, deletedValue: 0 },
  timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
  audit: { createdBy: "createdBy", updatedBy: "updatedBy" },
});

export const BRANCHES_ENTITY = defineEntity<IBranch>({
  table: ENTITY_NAMES.BRANCHES,
  primaryKey: "pkBranch",
  identity: true,
  columns: {
    pkBranch: { name: "PK_BRANCH", kind: "number", insertable: false, updatable: false },
    name: { name: "NAME", kind: "string" },
    address: { name: "ADDRESS", kind: "string" },
    phone: { name: "PHONE", kind: "string" },
    opensAt: { name: "OPENS_AT", kind: "string" },
    closesAt: { name: "CLOSES_AT", kind: "string" },
    available: { name: "AVAILABLE", kind: "boolean" },
    createdAt: { name: "CREATED_AT", kind: "date", updatable: false },
    updatedAt: { name: "UPDATED_AT", kind: "date" },
    createdBy: { name: "CREATED_BY", kind: "string", updatable: false },
    updatedBy: { name: "UPDATED_BY", kind: "string" },
  },
  softDelete: { property: "available", activeValue: 1, deletedValue: 0 },
  timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
  audit: { createdBy: "createdBy", updatedBy: "updatedBy" },
});

export const APPOINTMENTS_ENTITY = defineEntity<IAppointment>({
  table: ENTITY_NAMES.APPOINTMENTS,
  primaryKey: "pkAppointment",
  identity: true,
  columns: {
    pkAppointment: {
      name: "PK_APPOINTMENT",
      kind: "number",
      insertable: false,
      updatable: false,
    },
    fkBranch: { name: "FK_BRANCH", kind: "number" },
    fkClient: { name: "FK_CLIENT", kind: "number" },
    guestName: { name: "GUEST_NAME", kind: "string" },
    scheduledAt: { name: "SCHEDULED_AT", kind: "date" },
    durationMin: { name: "DURATION_MIN", kind: "number" },
    status: { name: "STATUS", kind: "string" },
    details: { name: "DETAILS", kind: "string" },
    available: { name: "AVAILABLE", kind: "boolean" },
    createdAt: { name: "CREATED_AT", kind: "date", updatable: false },
    updatedAt: { name: "UPDATED_AT", kind: "date" },
    createdBy: { name: "CREATED_BY", kind: "string", updatable: false },
    updatedBy: { name: "UPDATED_BY", kind: "string" },
  },
  softDelete: { property: "available", activeValue: 1, deletedValue: 0 },
  timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
  audit: { createdBy: "createdBy", updatedBy: "updatedBy" },
});
