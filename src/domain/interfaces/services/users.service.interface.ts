// src/domain/interfaces/services/users.service.interface.ts

import { UserDTO } from "../../../application/dtos/users.dtos";


export interface IUsersService {
    getAllUsers(): Promise<UserDTO[]>;
    getUserById(id: number): Promise<UserDTO | null>;
    createUser(user: UserDTO): Promise<boolean>;
    updateUser(id: number, user: Partial<UserDTO>): Promise<boolean>;
    deleteUser(id: number): Promise<boolean>;

}