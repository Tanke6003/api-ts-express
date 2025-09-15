// src/infrastructure/datasources/dummy/users.dummy.datasource.ts



import { IUsersDataSource } from "../../../domain/interfaces/datasources/users.datasource.interface";
import { IUser } from "../../../domain/models/users.model";

export class UsersDummyDataSource implements IUsersDataSource{
   
    private users: IUser[] = [
        { pkUser: 1, name: "John Doe" },
        { pkUser: 2, name: "Jane Smith" },
        { pkUser: 3, name: "Alice Johnson" },
        { pkUser: 4, name: "Bob Brown" }
    ];
    public async getAllUsers(): Promise<IUser[]> {
        return this.users;
    }
    
}