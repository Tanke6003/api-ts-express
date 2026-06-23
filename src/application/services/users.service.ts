// src/application/services/users.service.ts
import { IUsersService } from "../../domain/interfaces/application/services/users.service.interface";
import type { IUsersRepository } from "../../domain/interfaces/infrastructure/repositories/users.repository.interface";
import { PaginatedDTO, PaginationDTO, UserDTO } from "../dtos/users.dtos";
import { IUser } from "../../domain/models/users.model";
import { inject, injectable } from "tsyringe";
import { AppError } from "../../core/errors/app-error";

@injectable()
export class UsersService implements IUsersService {
  constructor(
    @inject("IUsersRepository") private readonly repository: IUsersRepository
  ) {}

  async getAllUsers(pagination: PaginationDTO): Promise<PaginatedDTO<UserDTO>> {
    const { page, limit } = pagination;
    const { users, total } = await this.repository.getAllUsers(page, limit);
    return {
      data: users.map((u) => this.toDTO(u)),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async getUserById(id: number): Promise<UserDTO | null> {
    const user = await this.repository.getUserById(id);
    if (!user) return null;
    return this.toDTO(user);
  }

  async createUser(user: UserDTO): Promise<boolean> {
    const ok = await this.repository.createUser(this.toModel(user));
    if (!ok) throw new AppError("Failed to create user", 500);
    return ok;
  }

  async updateUser(id: number, user: Partial<UserDTO>): Promise<boolean> {
    // El id de la ruta identifica al usuario; el payload solo aporta los campos
    // a actualizar. Mapeamos únicamente lo presente para no inventar un pkUser 0
    // ni escribir un name undefined en un update parcial.
    return await this.repository.updateUser(id, this.toPartialModel(user));
  }

  async deleteUser(id: number): Promise<boolean> {
    return await this.repository.deleteUser(id);
  }

  private toDTO(user: IUser): UserDTO {
    return { id: user.pkUser, name: user.name };
  }

  private toModel(userDTO: UserDTO): IUser {
    return { pkUser: userDTO.id || 0, name: userDTO.name };
  }

  private toPartialModel(userDTO: Partial<UserDTO>): Partial<IUser> {
    const model: Partial<IUser> = {};
    if (userDTO.name !== undefined) model.name = userDTO.name;
    return model;
  }
}
