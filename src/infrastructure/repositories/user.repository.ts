// src/infrastructure/repositories/user.repository.ts

import { IUsersRepository } from "../../domain/interfaces/repositories/users.repository.interface";
import { IUser } from "../../domain/models/users.model";

import { IUsersDataSource } from "../../domain/interfaces/datasources/users.datasource.interface";
import { UsersDummyDataSource } from "../datasources/dummy/users.dummy.datasource";
import { UsersSqlServerDataSource } from "../datasources/sqlserver/users.sqlserver.datasource";

export class UsersRepository implements IUsersRepository {
    private dataSource: IUsersDataSource;
    constructor() {
        this.dataSource = new UsersDummyDataSource();
    }


    public async getAllUsers(): Promise<IUser[]> {
        return this.dataSource.getAllUsers();
    }
        async getUserById(id: number): Promise<IUser | null> {
        return this.dataSource.getUserById(id);
    }

    async createUser(user: IUser): Promise<boolean> {
        return this.dataSource.createUser(user);
    }

    async updateUser(id: number, user: Partial<IUser>): Promise<boolean> {
        return this.dataSource.updateUser(id, user);
    }

    async deleteUser(id: number): Promise<boolean> {
        return this.dataSource.deleteUser(id);
    }
}