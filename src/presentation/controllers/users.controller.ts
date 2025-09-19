// user.controller.ts
import { Request, Response } from "express";
import { IUsersController } from "../../domain/interfaces/presentation/controllers/users.controller.interface";
import { IUsersService } from "../../domain/interfaces/application/services/users.service.interface";
import { inject, injectable } from "tsyringe";

@injectable()
export class UsersController implements IUsersController {

    constructor(
        @inject("IUsersService") private readonly usersService: IUsersService
    ) {
    }
    public getUserById = async (req: Request, res: Response): Promise<void> => {
        try {
            const userId = Number(req.params.id);
            const user = await this.usersService.getUserById(userId);
            if (!user) {
                res.status(404).json({ message: "User not found" });
                return;
            }
            res.json(user);
        } catch (error) {
            res.status(500).json({ message: "Internal server error" });
        }
    };

    public createUser = async (req: Request, res: Response): Promise<void> => {
        try {
            const userData = req.body;
            const newUser = await this.usersService.createUser(userData);
            res.status(201).json(newUser);
        } catch (error) {
            res.status(500).json({ message: "Internal server error" });
        }
    };

    public updateUser = async (req: Request, res: Response): Promise<void> => {
        try {
            const userId = Number(req.params.id);
            const updateData = req.body;
            const updatedUser = await this.usersService.updateUser(userId, updateData);
            if (!updatedUser) {
                res.status(404).json({ message: "User not found" });
                return;
            }
            res.json(updatedUser);
        } catch (error) {
            res.status(500).json({ message: "Internal server error" });
        }
    };

    public deleteUser = async (req: Request, res: Response): Promise<void> => {
        try {
            const userId = Number(req.params.id);
            const deleted = await this.usersService.deleteUser(userId);
            console.log(deleted);
            if (!deleted) {
                res.status(404).json({ message: "User not found" });
                return;
            }
            res.status(204).send();
        } catch (error) {
            res.status(500).json({ message: "Internal server error" });
        }
    };


    public getAllUsers = async (req: Request, res: Response) => {
        res.json(await this.usersService.getAllUsers());
    };

}