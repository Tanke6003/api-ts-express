// src/application/services/users.service.ts
import { IUsersService } from "../../domain/interfaces/application/services/users.service.interface";
import type { IUsersRepository } from "../../domain/interfaces/infrastructure/repositories/users.repository.interface";
import { UserDTO } from "../dtos/users.dtos";
import { IUser } from "../../domain/models/users.model";
import {  inject, injectable } from "tsyringe";


@injectable()
export class UsersService implements IUsersService {
    
    constructor(
        @inject("IUsersRepository") private readonly repository: IUsersRepository
    ) {
        
    }
    async getUserById(id: number): Promise<UserDTO | null> {
        try {
            const user = await this.repository.getUserById(id);
            if (!user) {
                throw new Error("User not found");
            }
            return this.toDTO(user);
        } catch (error:any) {
            throw new Error(error.message );
        }
        
    }

    async createUser(user: UserDTO): Promise<boolean> {
        try {
            return await this.repository.createUser(this.toModel(user));
        } catch (error) {
            throw new Error("Error creating user");
        }
    }

    async updateUser(id: number, user: Partial<UserDTO>): Promise<boolean> {
        return await this.repository.updateUser(id, this.toModel(user as UserDTO));
    }

    async deleteUser(id: number): Promise<boolean> {
        return await this.repository.deleteUser(id);
    }
  

    public async getAllUsers(): Promise<UserDTO[]> {
        const users = await this.repository.getAllUsers();
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