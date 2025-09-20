// src/infrastructure/repositories/user.repository.ts

import { IUsersRepository } from "../../domain/interfaces/infrastructure/repositories/users.repository.interface.js";
import { IUser } from "../../domain/models/users.model.js";
import type { IUsersDataSource } from "../../domain/interfaces/infrastructure/datasources/users.datasource.interface.js";
import type { ILogger } from "../../domain/interfaces/infrastructure/plugins/logger.plugin.interface.js";
import { inject, injectable } from "tsyringe";

@injectable()
export class UsersRepository implements IUsersRepository {
    constructor(
        @inject("IUsersDataSource") private readonly dataSource: IUsersDataSource,
        @inject("ILogger") private readonly logger: ILogger
    ) {}

    public async getAllUsers(): Promise<IUser[]> {
        try {
            return await this.dataSource.getAllUsers();
        } catch (error) {
            this.logger.error("Error in UsersRepository.getAllUsers", { error });
            throw new Error("Failed to fetch users.");
        }
    }

    public async getUserById(id: number): Promise<IUser | null> {
        try {
            return await this.dataSource.getUserById(id);
        } catch (error) {
            this.logger.error(`Error in UsersRepository.getUserById`, { id, error });
            throw new Error("Failed to fetch user.");
        }
    }

    public async createUser(user: IUser): Promise<boolean> {
        try {
            return await this.dataSource.createUser(user);
        } catch (error) {
            this.logger.error("Error in UsersRepository.createUser", { user, error });
            throw new Error("Failed to create user.");
        }
    }

    public async updateUser(id: number, user: Partial<IUser>): Promise<boolean> {
        try {
            return await this.dataSource.updateUser(id, user);
        } catch (error) {
            this.logger.error("Error in UsersRepository.updateUser", { id, user, error });
            throw new Error("Failed to update user.");
        }
    }

    public async deleteUser(id: number): Promise<boolean> {
        try {
            return await this.dataSource.deleteUser(id);
        } catch (error) {
            this.logger.error("Error in UsersRepository.deleteUser", { id, error });
            throw new Error("Failed to delete user.");
        }
    }
}
