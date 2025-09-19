// src/domain/interfaces/controllers/users.controller.interface.ts

export interface IUsersController {
    getAllUsers(req: any, res: any): Promise<void>;
    getUserById(req: any, res: any): Promise<void>;
    createUser(req: any, res: any): Promise<void>;
    updateUser(req: any, res: any): Promise<void>;
    deleteUser(req: any, res: any): Promise<void>;
}