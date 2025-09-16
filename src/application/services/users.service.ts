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
    async getUserById(id: number): Promise<UserDTO | null> {
        const user = await this.usersRepository.getUserById(id);
        return user ? this.toDTO(user) : null;
    }

    async createUser(user: UserDTO): Promise<boolean> {
        return await this.usersRepository.createUser(this.toModel(user));
    }

    async updateUser(id: number, user: Partial<UserDTO>): Promise<boolean> {
        return await this.usersRepository.updateUser(id, this.toModel(user as UserDTO));
    }

    async deleteUser(id: number): Promise<boolean> {
        return await this.usersRepository.deleteUser(id);
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
    private toModel(userDTO: UserDTO): IUser {
        return {
            pkUser: userDTO.id || 0,
            name: userDTO.name,
        };
    }
}