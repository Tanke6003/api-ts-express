// src/presentation/controllers/users.controller.ts
import { Request, Response } from "express";
import { IUsersController } from "../../domain/interfaces/presentation/controllers/users.controller.interface";
import type { IUsersService } from "../../domain/interfaces/application/services/users.service.interface";
import { inject, injectable } from "tsyringe";

@injectable()
export class UsersController implements IUsersController {

  constructor(
    @inject("IUsersService") private readonly usersService: IUsersService
  ) {}

  public getAllUsers = async (_req: Request, res: Response): Promise<void> => {
    try {
      const users = await this.usersService.getAllUsers();
      res.json(users);
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  };

  public getUserById = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = Number(req.params.id);
      const user = await this.usersService.getUserById(userId);
      if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
      }
      res.json(user);
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  };

  public createUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const newUser = await this.usersService.createUser(req.body);
      res.status(201).json(newUser);
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  };

  public updateUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = Number(req.params.id);
      const updated = await this.usersService.updateUser(userId, req.body);
      if (!updated) {
        res.status(404).json({ message: "User not found" });
        return;
      }
      res.json(updated);
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  };

  public deleteUser = async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = Number(req.params.id);
      const deleted = await this.usersService.deleteUser(userId);
      if (!deleted) {
        res.status(404).json({ message: "User not found" });
        return;
      }
      res.status(204).send();
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  };
}
