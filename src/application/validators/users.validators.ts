import { z } from "zod";

export const createUserSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name is too long"),
});

export const updateUserSchema = z.object({
  name: z.string().min(1, "Name cannot be empty").max(100, "Name is too long"),
});

export const paginationSchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1))
    .pipe(z.number().int().min(1, "page must be >= 1")),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 10))
    .pipe(z.number().int().min(1).max(100, "limit must be <= 100")),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
