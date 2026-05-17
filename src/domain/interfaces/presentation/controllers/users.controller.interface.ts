// src/domain/interfaces/controllers/users.controller.interface.ts

import { Request, Response, NextFunction } from "express";

export interface IUsersController {
  getAllUsers(req: Request, res: Response, next: NextFunction): Promise<void>;
  getUserById(req: Request, res: Response, next: NextFunction): Promise<void>;
  createUser(req: Request, res: Response, next: NextFunction): Promise<void>;
  updateUser(req: Request, res: Response, next: NextFunction): Promise<void>;
  deleteUser(req: Request, res: Response, next: NextFunction): Promise<void>;
}
