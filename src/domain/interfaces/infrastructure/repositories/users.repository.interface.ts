// src/domain/interfaces/infrastructure/repositories/users.repository.interface.ts
import { IUser } from "../../../models/users.model";
import { IGenericRepository } from "./generic.repository.interface";

/**
 * Usuarios: el repositorio genérico cubre todo lo que necesita el módulo.
 *
 * Antes había además un `IUsersDataSource` por debajo, de cuando cada motor
 * llevaba su CRUD escrito a mano. Con el repositorio genérico esa capa quedó en
 * un simple reenvío y se eliminó: el driver se elige en la fábrica de
 * persistencia, no encadenando interfaces.
 */
export type IUsersRepository = IGenericRepository<IUser>;
