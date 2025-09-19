// src/domain/interfaces/repositories/users.repository.interface.ts

import { IUser } from "../../../models/users.model";

export interface IUsersRepository {
    getAllUsers(): Promise<IUser[]>;
    getUserById(id: number): Promise<IUser | null>;
    createUser(user: IUser): Promise<boolean>;
    updateUser(id: number, user: Partial<IUser>): Promise<boolean>;
    deleteUser(id: number): Promise<boolean>;

}