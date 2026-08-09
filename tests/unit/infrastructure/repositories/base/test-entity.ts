// tests/unit/infrastructure/repositories/base/test-entity.ts
import { defineEntity } from "../../../../../src/infrastructure/repositories/base/entity-metadata";

/** Entidad de juguete: cubre todos los tipos de columna que soporta el mapeo. */
export interface ITestItem {
  pkItem: number;
  name: string;
  qty: number;
  tag?: string | null;
  flag?: boolean;
  dueAt?: Date | null;
  active?: boolean;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

export const TEST_ENTITY = defineEntity<ITestItem>({
  table: "ITEMS",
  primaryKey: "pkItem",
  identity: true,
  columns: {
    pkItem: { name: "PK_ITEM", kind: "number", insertable: false, updatable: false },
    name: { name: "NAME", kind: "string" },
    qty: { name: "QTY", kind: "number" },
    tag: { name: "TAG", kind: "string" },
    flag: { name: "FLAG", kind: "boolean" },
    dueAt: { name: "DUE_AT", kind: "date" },
    active: { name: "ACTIVE", kind: "boolean" },
    createdAt: { name: "CREATED_AT", kind: "date", updatable: false },
    updatedAt: { name: "UPDATED_AT", kind: "date" },
  },
  softDelete: { property: "active", activeValue: 1, deletedValue: 0 },
  timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
});

/** Variante sin borrado lógico ni timestamps, para los caminos alternativos. */
export interface IPlainItem {
  code: string;
  label: string;
}

export const PLAIN_ENTITY = defineEntity<IPlainItem>({
  table: "PLAIN",
  primaryKey: "code",
  identity: false,
  columns: {
    code: { name: "CODE", kind: "string" },
    label: { name: "LABEL", kind: "string" },
  },
});

export const SEED: Partial<ITestItem>[] = [
  { name: "alpha", qty: 10, tag: "x", flag: true, dueAt: new Date("2026-01-10T10:00:00Z") },
  { name: "beta", qty: 20, tag: null, flag: false, dueAt: new Date("2026-02-10T10:00:00Z") },
  { name: "gamma", qty: 30, tag: "y", flag: true, dueAt: new Date("2026-03-10T10:00:00Z") },
];

/** Variante con columnas de auditoria de usuario. */
export interface IAuditedItem {
  pkItem: number;
  name: string;
  createdBy?: string | null;
  updatedBy?: string | null;
}

export const AUDITED_ENTITY = defineEntity<IAuditedItem>({
  table: "AUDITED",
  primaryKey: "pkItem",
  identity: true,
  columns: {
    pkItem: { name: "PK_ITEM", kind: "number", insertable: false, updatable: false },
    name: { name: "NAME", kind: "string" },
    createdBy: { name: "CREATED_BY", kind: "string", updatable: false },
    updatedBy: { name: "UPDATED_BY", kind: "string" },
  },
  audit: { createdBy: "createdBy", updatedBy: "updatedBy" },
});

/** Igual que la anterior pero ademas con borrado logico. */
export const AUDITED_SOFT_ENTITY = defineEntity<IAuditedItem & { active?: boolean }>({
  table: "AUDITED_SOFT",
  primaryKey: "pkItem",
  identity: true,
  columns: {
    pkItem: { name: "PK_ITEM", kind: "number", insertable: false, updatable: false },
    name: { name: "NAME", kind: "string" },
    active: { name: "ACTIVE", kind: "boolean" },
    createdBy: { name: "CREATED_BY", kind: "string", updatable: false },
    updatedBy: { name: "UPDATED_BY", kind: "string" },
  },
  softDelete: { property: "active", activeValue: 1, deletedValue: 0 },
  audit: { createdBy: "createdBy", updatedBy: "updatedBy" },
});
