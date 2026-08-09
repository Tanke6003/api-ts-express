import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";
import { AppError } from "../../core/errors/app-error";

/**
 * Traduce el fallo de Zod al error de la aplicación y lo delega en el manejador
 * global. Así una validación responde con el mismo formato —código, id de
 * petición, marca de tiempo— que cualquier otro error de la API.
 */
function validationError(issues: { path: PropertyKey[]; message: string }[]): AppError {
  return new AppError("Validation failed", 400, true, {
    code: "VALIDATION_ERROR",
    errors: issues.map((issue) => ({
      field: issue.path.map(String).join(".") || "(body)",
      message: issue.message,
    })),
  });
}

export function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(validationError(result.error.issues));
      return;
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      next(validationError(result.error.issues));
      return;
    }
    // El tipo concreto depende del esquema recibido; lo afirma el controlador
    // que lo consume (ver src/types/express.d.ts).
    req.validatedQuery = result.data;
    next();
  };
}
