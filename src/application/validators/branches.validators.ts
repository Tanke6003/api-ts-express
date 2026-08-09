import { z } from "zod";

/** Query params llegan siempre como texto: "true" es el único valor afirmativo. */
const queryBoolean = z
  .string()
  .optional()
  .transform((value) => value === "true");

const timeOfDay = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "El horario debe tener el formato HH:mm");

export const branchShapeSchema = z.object({
  name: z.string().min(1, "El nombre es obligatorio").max(100, "El nombre es demasiado largo"),
  address: z.string().max(200, "La dirección es demasiado larga").nullish(),
  phone: z.string().max(30, "El teléfono es demasiado largo").nullish(),
  opensAt: timeOfDay.optional(),
  closesAt: timeOfDay.optional(),
});

export const createBranchSchema = branchShapeSchema;

export const updateBranchSchema = branchShapeSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "No hay nada que actualizar");

export const branchQuerySchema = z.object({
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
  search: z.string().trim().min(1).max(100).optional(),
  withDeleted: queryBoolean,
});

export type CreateBranchInput = z.infer<typeof createBranchSchema>;
export type UpdateBranchInput = z.infer<typeof updateBranchSchema>;
export type BranchQueryInput = z.infer<typeof branchQuerySchema>;
