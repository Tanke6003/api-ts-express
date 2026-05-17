// src/domain/interfaces/repositories/users.repository.interface.ts

import { IUser } from "../../../models/users.model";

export interface IUsersRepository {
  getAllUsers(page: number, limit: number): Promise<{ users: IUser[]; total: number }>;
  getUserById(id: number): Promise<IUser | null>;
  createUser(user: IUser): Promise<boolean>;
  updateUser(id: number, user: Partial<IUser>): Promise<boolean>;
  deleteUser(id: number): Promise<boolean>;
}
