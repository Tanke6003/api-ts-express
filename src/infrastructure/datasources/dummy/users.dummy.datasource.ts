// src/infrastructure/datasources/dummy/users.dummy.datasource.ts

import type { IUsersDataSource } from "../../../domain/interfaces/infrastructure/datasources/users.datasource.interface";
import { IUser } from "../../../domain/models/users.model";

export class UsersDummyDataSource implements IUsersDataSource {
  private users: IUser[] = [
    { pkUser: 1, name: "John Doe", available: true },
    { pkUser: 2, name: "Jane Smith", available: true },
    { pkUser: 3, name: "Alice Johnson", available: true },
    { pkUser: 4, name: "Bob Brown", available: true },
  ];

  private idCounter = this.users.length + 1;

  public async getAllUsers(): Promise<IUser[]> {
    // Solo devolvemos los que siguen disponibles
    return this.users.filter(u => u.available);
  }

  public async getUserById(id: number): Promise<IUser | null> {
    const user = this.users.find(u => u.pkUser === id && u.available);
    return user || null;
  }

  public async createUser(user: IUser): Promise<boolean> {
    // Asignamos PK autoincremental y disponible = true
    const newUser: IUser = {
      pkUser: this.idCounter++,
      name: user.name,
      available: true,
    };
    this.users.push(newUser);
    return true;
  }

  public async updateUser(id: number, user: Partial<IUser>): Promise<boolean> {
    const record = this.users.find(u => u.pkUser === id && u.available);
    if (!record) {
      return false;
    }
    record.name = user.name ?? record.name;
    return true;
  }

  public async deleteUser(id: number): Promise<boolean> {
    const record = this.users.find(u => u.pkUser === id && u.available);
    if (!record) {
      return false;
    }
    record.available = false; // Borrado lógico
    return true;
  }
}
