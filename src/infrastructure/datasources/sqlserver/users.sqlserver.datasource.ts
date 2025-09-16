// src/infrastructure/datasources/sqlserver/users.sqlserver.datasource.ts

import { IUsersDataSource } from "../../../domain/interfaces/datasources/users.datasource.interface";
import { IUser } from "../../../domain/models/users.model";
import { SequelizePlugin } from "../../plugins/sequelize.plugin";

export class UsersSqlServerDataSource implements IUsersDataSource {
    private db:SequelizePlugin;

    constructor(){
        this.db = new SequelizePlugin({
            dialect: "mssql",
            host: process.env.DB_HOST || "localhost", 
            port: Number(process.env.DB_PORT) || 1434,
            username: process.env.DB_USER || "sa",
            password: process.env.DB_PASSWORD || "StrongPassword123!",
            database: process.env.DB_NAME || "testdb"
        });
        this.db.authenticate(); 
    }       
   

async getAllUsers(): Promise<IUser[]> {
  const query = "SELECT * FROM Users WHERE Available = 1";
  const result = await this.db.executeQuery(query);

  console.log(result.rows);

  const users: IUser[] = result.rows.map((row: any) => ({
    pkUser: row.PKUser,
    name: row.Name,
  }));

  return users;
}

async getUserById(id: number): Promise<IUser | null> {
  const query = "SELECT * FROM Users WHERE PKUser = ? AND Available = 1";
  const rows = await this.db.getDataTable(query, [id]);

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    pkUser: row.PKUser,
    name: row.Name,
  } as IUser;
}

async createUser(user: IUser): Promise<boolean> {
  const query = "INSERT INTO Users (Name) VALUES (?)";
  const result = await this.db.executeQuery(query, [user.name]);
console.log(result);
  const rowsAffected = result.metadata ?? undefined;
    return rowsAffected > 0;
}

async updateUser(id: number, user: Partial<IUser>): Promise<boolean> {
  const query = "UPDATE Users SET Name = ? WHERE PKUser = ?";
  const result = await this.db.executeQuery(query, [user.name, id]);
    console.log(result);
  const affected = result.metadata ?? undefined;

  return affected > 0;
 
}

async deleteUser(id: number): Promise<boolean> {
  const query =
    "UPDATE Users SET Available = 0 WHERE PKUser = ? AND Available = 1";
  const result = await this.db.executeQuery(query, [id]);
console.log(result);
  const affected = result.metadata ?? 0;
  return affected > 0;
}



    }   