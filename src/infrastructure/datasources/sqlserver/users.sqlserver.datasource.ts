// src/infrastructure/datasources/sqlserver/users.sqlserver.datasource.ts

import { inject, injectable } from "tsyringe";
import { IUsersDataSource } from "../../../domain/interfaces/infrastructure/datasources/users.datasource.interface";
import { IUser } from "../../../domain/models/users.model";
import { SequelizePlugin } from "../../plugins/sequelize.plugin";
import type { ILogger } from "../../../domain/interfaces/infrastructure/plugins/logger.plugin.interface";

@injectable()
export class UsersSqlServerDataSource implements IUsersDataSource {
  constructor(
    @inject("ILogger") private readonly logger: ILogger,
    @inject("TestDB") private readonly db: SequelizePlugin
  ) {
    this.db.authenticate().catch((err) => {
      this.logger.error("Error al autenticar con la base de datos", { err });
      throw new Error(`[DataSource] Error al autenticar SequelizePlugin: ${err.message}`);
    });
  }

  async getAllUsers(page: number, limit: number): Promise<{ users: IUser[]; total: number }> {
    try {
      const offset = (page - 1) * limit;
      const countResult = await this.db.executeQuery(
        "SELECT COUNT(*) AS total FROM Users WHERE Available = 1"
      );
      const total = countResult.rows[0]?.total ?? 0;

      const query =
        "SELECT * FROM Users WHERE Available = 1 ORDER BY PKUser OFFSET ? ROWS FETCH NEXT ? ROWS ONLY";
      const result = await this.db.executeQuery(query, [offset, limit]);

      this.logger.debug("getAllUsers ejecutado", { page, limit, total });

      const users = result.rows.map((row: any) => ({
        pkUser: row.PKUser,
        name: row.Name,
      }));

      return { users, total };
    } catch (err: any) {
      this.logger.error("Error en getAllUsers", { err });
      throw new Error(`[DataSource] getAllUsers failed: ${err.message}`);
    }
  }

  async getUserById(id: number): Promise<IUser | null> {
    try {
      const query = "SELECT * FROM Users WHERE PKUser = ? AND Available = 1";
      const rows = await this.db.getDataTable(query, [id]);
      if (rows.length === 0) return null;
      return { pkUser: rows[0].PKUser, name: rows[0].Name };
    } catch (err: any) {
      this.logger.error("Error en getUserById", { id, err });
      throw new Error(`[DataSource] getUserById failed for id=${id}: ${err.message}`);
    }
  }

  async createUser(user: IUser): Promise<boolean> {
    try {
      const query = "INSERT INTO Users (Name) VALUES (?)";
      const result = await this.db.executeQuery(query, [user.name]);
      const affected = result.metadata ?? 0;
      this.logger.info("Usuario creado", { user, affected });
      return affected > 0;
    } catch (err: any) {
      this.logger.error("Error en createUser", { user, err });
      throw new Error(`[DataSource] createUser failed: ${err.message}`);
    }
  }

  async updateUser(id: number, user: Partial<IUser>): Promise<boolean> {
    try {
      const query = "UPDATE Users SET Name = ? WHERE PKUser = ?";
      const result = await this.db.executeQuery(query, [user.name, id]);
      const affected = result.metadata ?? 0;
      this.logger.info("Usuario actualizado", { id, user, affected });
      return affected > 0;
    } catch (err: any) {
      this.logger.error("Error en updateUser", { id, user, err });
      throw new Error(`[DataSource] updateUser failed for id=${id}: ${err.message}`);
    }
  }

  async deleteUser(id: number): Promise<boolean> {
    try {
      const query =
        "UPDATE Users SET Available = 0 WHERE PKUser = ? AND Available = 1";
      const result = await this.db.executeQuery(query, [id]);
      const affected = result.metadata ?? 0;
      this.logger.warn("Usuario marcado como eliminado", { id, affected });
      return affected > 0;
    } catch (err: any) {
      this.logger.error("Error en deleteUser", { id, err });
      throw new Error(`[DataSource] deleteUser failed for id=${id}: ${err.message}`);
    }
  }
}
