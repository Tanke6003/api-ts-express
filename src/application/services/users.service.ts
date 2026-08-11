// src/application/services/users.service.ts
import { IUsersService } from "../../domain/interfaces/application/services/users.service.interface";
import type { IUsersRepository } from "../../domain/interfaces/infrastructure/repositories/users.repository.interface";
import { PaginatedDTO, PaginationDTO, UserDTO } from "../dtos/users.dtos";
import { inject, injectable } from "tsyringe";
import { AppError } from "../../core/errors/app-error";
import { userMapper } from "../mapping/profiles";

@injectable()
export class UsersService implements IUsersService {
  constructor(
    @inject("IUsersRepository") private readonly repository: IUsersRepository
  ) {}

  async getAllUsers(pagination: PaginationDTO): Promise<PaginatedDTO<UserDTO>> {
    const { page, limit } = pagination;
    const paged = await this.repository.getPaged(page, limit, {
      orderBy: { field: "pkUser", direction: "asc" },
    });

    return {
      data: userMapper.toDTOList(paged.items),
      total: paged.total,
      page: paged.page,
      limit: paged.limit,
      pages: paged.pages,
    };
  }

  async getUserById(id: number): Promise<UserDTO | null> {
    const user = await this.repository.getById(id);
    return user ? userMapper.toDTO(user) : null;
  }

  async createUser(user: UserDTO): Promise<boolean> {
    // La PK la genera la base: el mapeador la trata como sólo lectura, así que
    // no llega desde el cuerpo de la petición.
    const created = await this.repository.insert(userMapper.toEntity(user));
    if (!created) throw new AppError("Failed to create user", 500);
    return true;
  }

  async updateUser(id: number, user: Partial<UserDTO>): Promise<boolean> {
    // El id de la ruta identifica al usuario; el payload sólo aporta los campos
    // a actualizar, y el mapeador salta los que no vinieron.
    return (await this.repository.update(id, userMapper.toPartialEntity(user))) !== null;
  }

  /** Borrado lógico, para conservar el histórico de citas del cliente. */
  async deleteUser(id: number): Promise<boolean> {
    return this.repository.softDelete(id);
  }
}
