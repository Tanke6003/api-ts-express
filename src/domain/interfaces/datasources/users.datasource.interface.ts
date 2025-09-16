// src/domain/interfaces/datasources/users.datasource.interface.ts

import { IUser } from "../../models/users.model";

export interface IUsersDataSource {
    getAllUsers(): Promise<IUser[]>;
}