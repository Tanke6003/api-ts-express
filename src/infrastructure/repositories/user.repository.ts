// src/infrastructure/repositories/user.repository.ts

import { IUsersRepository } from "../../domain/interfaces/repositories/users.repository.interface";
import { IUser } from "../../domain/models/users.model";

import { IUsersDataSource } from "../../domain/interfaces/datasources/users.datasource.interface";
import { UsersDummyDataSource } from "../datasources/dummy/users.dummy.datasource";

export class UsersRepository implements IUsersRepository {
    private dataSource: IUsersDataSource;
    constructor() {
        this.dataSource = new UsersDummyDataSource();
    }

    public async getAllUsers(): Promise<IUser[]> {
        return this.dataSource.getAllUsers();
    }
}