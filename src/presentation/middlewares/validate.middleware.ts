import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";
import type { PaginationInput } from "../../application/validators/users.validators";

export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        status: "error",
        message: "Validation failed",
        errors: result.error.issues.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        })),
      });
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      res.status(400).json({
        status: "error",
        message: "Validation failed",
        errors: result.error.issues.map((e) => ({
          field: e.path.join("."),
          message: e.message,
        })),
      });
      return;
    }
    // validateQuery currently backs only the pagination query; the parsed
    // output is typed as PaginationInput on the Request (see src/types/express.d.ts).
    req.validatedQuery = result.data as PaginationInput;
    next();
  };
}
