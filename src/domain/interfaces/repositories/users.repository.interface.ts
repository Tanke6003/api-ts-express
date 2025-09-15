// src/domain/interfaces/repositories/users.repository.interface.ts

import { IUser } from "../../models/users.model";

export interface IUsersRepository {
    getAllUsers(): Promise<IUser[]>;
}