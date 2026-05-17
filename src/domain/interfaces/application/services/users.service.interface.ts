// src/domain/interfaces/services/users.service.interface.ts

import { PaginatedDTO, PaginationDTO, UserDTO } from "../../../../application/dtos/users.dtos";

export interface IUsersService {
  getAllUsers(pagination: PaginationDTO): Promise<PaginatedDTO<UserDTO>>;
  getUserById(id: number): Promise<UserDTO | null>;
  createUser(user: UserDTO): Promise<boolean>;
  updateUser(id: number, user: Partial<UserDTO>): Promise<boolean>;
  deleteUser(id: number): Promise<boolean>;
}
