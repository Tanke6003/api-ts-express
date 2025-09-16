// src/domain/interfaces/services/users.service.interface.ts

import { UserDTO } from "../../../application/dtos/users.dtos";


export interface IUsersService {
    getAllUsers(): Promise<UserDTO[]>;
}