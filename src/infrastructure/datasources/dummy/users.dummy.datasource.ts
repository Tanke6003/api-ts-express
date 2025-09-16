// src/infrastructure/datasources/dummy/users.dummy.datasource.ts



import { IUsersDataSource } from "../../../domain/interfaces/datasources/users.datasource.interface";
import { IUser } from "../../../domain/models/users.model";

export class UsersDummyDataSource implements IUsersDataSource {
    private users: IUser[] = [
        { pkUser: 1, name: "John Doe" },
        { pkUser: 2, name: "Jane Smith" },
        { pkUser: 3, name: "Alice Johnson" },
        { pkUser: 4, name: "Bob Brown" }
    ];

    public async getAllUsers(): Promise<IUser[]> {
        return this.users;
    }

    public async getUserById(id: number): Promise<IUser | null> {
        const user = this.users.find(u => u.pkUser === id);
        return user || null;
    }

    public async createUser(user: IUser): Promise<boolean> {
        if (this.users.some(u => u.pkUser === user.pkUser)) {
            return false; // Duplicate pkUser
        }
        this.users.push(user);
        return true;
    }

    public async updateUser(id: number, user: Partial<IUser>): Promise<boolean> {
        const index = this.users.findIndex(u => u.pkUser === id);
        if (index === -1) {
            return false;
        }
        this.users[index] = { ...this.users[index], ...user };
        return true;
    }

    public async deleteUser(id: number): Promise<boolean> {
        const index = this.users.findIndex(u => u.pkUser === id);
        if (index === -1) {
            return false;
        }
        this.users.splice(index, 1);
        return true;
    }
}