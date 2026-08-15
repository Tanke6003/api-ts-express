// src/application/services/users.service.ts
import { inject, injectable } from "tsyringe";
import type { IUsersService } from "../../domain/interfaces/application/services/users.service.interface";
import type { IUsersRepository } from "../../domain/interfaces/infrastructure/repositories/users.repository.interface";
import type { IUser } from "../../domain/models/users.model";
import type { UserDTO } from "../dtos/users.dtos";
import { userMapper } from "../mapping/profiles";
import { CrudService } from "./crud.service";
import { TOKENS } from "../../core/di/tokens";

/**
 * Usuarios: un CRUD sin reglas propias, así que no escribe ninguna.
 *
 * Todo lo que hacía —paginar, mapear a DTO, insertar, actualizar por partes,
 * borrar lógicamente— es idéntico en cualquier módulo plano y vive en
 * `CrudService`. Lo único que aporta aquí es con qué repositorio y con qué
 * mapeador trabaja, y en qué orden lista.
 *
 * El día que tenga una regla —un email único, un saldo que no puede bajar de
 * cero— se sobrescribe ese verbo y los demás siguen viniendo de la base.
 */
@injectable()
export class UsersService extends CrudService<IUser, UserDTO> implements IUsersService {
  constructor(@inject(TOKENS.IUsersRepository) repository: IUsersRepository) {
    super(repository, userMapper, { field: "pkUser", direction: "asc" });
  }
}
