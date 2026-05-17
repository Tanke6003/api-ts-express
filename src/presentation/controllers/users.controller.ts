// src/presentation/controllers/users.controller.ts
import { Request, Response, NextFunction } from "express";
import { IUsersController } from "../../domain/interfaces/presentation/controllers/users.controller.interface";
import type { IUsersService } from "../../domain/interfaces/application/services/users.service.interface";
import { inject, injectable } from "tsyringe";
import { AppError } from "../../core/errors/app-error";

@injectable()
export class UsersController implements IUsersController {
  constructor(
    @inject("IUsersService") private readonly usersService: IUsersService
  ) {}

  public getAllUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { page, limit } = (req as any).validatedQuery ?? { page: 1, limit: 10 };
      const result = await this.usersService.getAllUsers({ page, limit });
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  public getUserById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = Number(req.params.id);
      if (isNaN(userId)) throw new AppError("Invalid user ID", 400);
      const user = await this.usersService.getUserById(userId);
      if (!user) throw new AppError("User not found", 404);
      res.json(user);
    } catch (err) {
      next(err);
    }
  };

  public createUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.usersService.createUser(req.body);
      res.status(201).json({ status: "ok", message: "User created" });
    } catch (err) {
      next(err);
    }
  };

  public updateUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = Number(req.params.id);
      if (isNaN(userId)) throw new AppError("Invalid user ID", 400);
      const updated = await this.usersService.updateUser(userId, req.body);
      if (!updated) throw new AppError("User not found", 404);
      res.json({ status: "ok", message: "User updated" });
    } catch (err) {
      next(err);
    }
  };

  public deleteUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = Number(req.params.id);
      if (isNaN(userId)) throw new AppError("Invalid user ID", 400);
      const deleted = await this.usersService.deleteUser(userId);
      if (!deleted) throw new AppError("User not found", 404);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };
}
