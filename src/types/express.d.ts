// src/types/express.d.ts
// Declaration merging to type the custom properties we attach to Express's Request:
//  - `user`: the decoded JWT payload set by the auth middleware (JwtPlugin).
//  - `validatedQuery`: the parsed/validated query set by the validateQuery middleware.
import type { JwtPayload } from "jsonwebtoken";

declare global {
  namespace Express {
    interface Request {
      user?: string | JwtPayload;
      /**
       * Salida del esquema que se pasó a `validateQuery`. Cada módulo usa un
       * esquema distinto, así que el tipo concreto lo afirma el controlador que
       * lo consume.
       */
      validatedQuery?: unknown;
    }
  }
}

export {};
