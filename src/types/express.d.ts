// src/types/express.d.ts
// Declaration merging to type the custom properties we attach to Express's Request:
//  - `user`: the decoded JWT payload set by the auth middleware (JwtPlugin).
//  - `validatedQuery`: the parsed/validated query set by the validateQuery middleware.
import type { JwtPayload } from "jsonwebtoken";
import type { PaginationInput } from "../application/validators/users.validators";

declare global {
  namespace Express {
    interface Request {
      user?: string | JwtPayload;
      validatedQuery?: PaginationInput;
    }
  }
}

export {};
