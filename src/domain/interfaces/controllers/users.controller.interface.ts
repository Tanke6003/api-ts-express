// src/domain/interfaces/controllers/users.controller.interface.ts

export interface IUsersController {
    getAllUsers(req: any, res: any): Promise<void>;
}