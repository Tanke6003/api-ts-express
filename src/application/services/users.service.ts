// src/application/services/users.service.ts
import { IUsersService } from "../../domain/interfaces/services/users.service.interface";
import { IUsersRepository } from "../../domain/interfaces/repositories/users.repository.interface";
import { UserDTO } from "../dtos/users.dtos";
import { IUser } from "../../domain/models/users.model";
import { UsersRepository } from "../../infrastructure/repositories/user.repository";

export class UsersService implements IUsersService {
    private usersRepository: IUsersRepository
    constructor() {
        this.usersRepository = new UsersRepository();
    }

    public async getAllUsers(): Promise<UserDTO[]> {
        const users = await this.usersRepository.getAllUsers();
        return users.map(user => this.toDTO(user));
    }

    private toDTO(user: IUser): UserDTO {
        return {
            id: user.pkUser,
            name: user.name,
        };
    }
}