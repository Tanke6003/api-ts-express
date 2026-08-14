// src/domain/interfaces/presentation/controllers/identity.controller.interface.ts
import { Request, Response, NextFunction } from "express";

export interface IIdentityController {
  /** Identidad del usuario autenticado, resuelta a partir del token. */
  me(req: Request, res: Response, next: NextFunction): Promise<void>;
}
