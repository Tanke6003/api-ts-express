// user.controller.ts
import { Request, Response } from "express";
import { IUsersController } from "../../domain/interfaces/controllers/users.controller.interface";
import { IUsersService } from "../../domain/interfaces/services/users.service.interface";
import { UsersService } from "../../application/services/users.service";

export class UsersController implements IUsersController {
    private usersService: IUsersService;
    constructor() {
        this.usersService = new UsersService();
    }
    
    public getAllUsers = async (req: Request, res: Response) =>{
        res.json(await this.usersService.getAllUsers());
    }   
 
}