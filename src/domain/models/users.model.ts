// src/domain/models/users.model.ts

/**
 * Los campos más allá de `pkUser`/`name` son opcionales porque las tres fuentes
 * de datos (dummy, SQL Server y Oracle) no exponen lo mismo: sólo el esquema de
 * Oracle tiene email, teléfono y auditoría.
 */
export interface IUser {
    pkUser: number;
    name: string;
    email?: string | null;
    phone?: string | null;
    wallet?: number | null;
    /** Distingue a los clientes (pueden ser titulares de una cita) del staff. */
    isClient?: boolean;
    available?: boolean; // borrado lógico
    createdAt?: Date | null;
    updatedAt?: Date | null;
    /** Auditoria: la rellena el repositorio con el usuario del token. */
    createdBy?: string | null;
    updatedBy?: string | null;
}
