// src/infrastructure/datasources/generic/users.generic.datasource.ts
import { inject, injectable } from "tsyringe";
import type { IUsersDataSource } from "../../../domain/interfaces/infrastructure/datasources/users.datasource.interface";
import type { IGenericRepository } from "../../../domain/interfaces/infrastructure/repositories/generic.repository.interface";
import type { IUser } from "../../../domain/models/users.model";

/**
 * Implementación de `IUsersDataSource` sobre el repositorio genérico.
 *
 * No contiene SQL: `UsersStore` es el repositorio genérico del driver activo
 * —Oracle o memoria—, así que esta misma clase sirve para `DATA_SOURCE=oracle`
 * y para `DATA_SOURCE=dummy`. Es el reemplazo del datasource dummy escrito a
 * mano: el mismo comportamiento, sin CRUD duplicado.
 */
@injectable()
export class UsersGenericDataSource implements IUsersDataSource {
  constructor(@inject("UsersStore") private readonly store: IGenericRepository<IUser>) {}

  async getAllUsers(page: number, limit: number): Promise<{ users: IUser[]; total: number }> {
    const paged = await this.store.getPaged(page, limit, {
      orderBy: { field: "pkUser", direction: "asc" },
    });
    return { users: paged.items, total: paged.total };
  }

  async getUserById(id: number): Promise<IUser | null> {
    return this.store.getById(id);
  }

  async createUser(user: IUser): Promise<boolean> {
    // La PK es IDENTITY: el repositorio genérico la ignora en el INSERT y
    // devuelve la entidad ya con el valor asignado por la base.
    await this.store.insert(user);
    return true;
  }

  async updateUser(id: number, user: Partial<IUser>): Promise<boolean> {
    return (await this.store.update(id, user)) !== null;
  }

  /** Borrado lógico, para conservar el histórico de citas del cliente. */
  async deleteUser(id: number): Promise<boolean> {
    return this.store.softDelete(id);
  }
}
