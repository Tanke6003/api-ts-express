// src/domain/models/users.model.ts
export interface IUser {
    pkUser: number;
    name: string;
    available?: boolean; // Para DummyDataSource
}