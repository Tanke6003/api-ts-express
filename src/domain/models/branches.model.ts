// src/domain/models/branches.model.ts

/** Sucursal donde se atienden las citas. */
export interface IBranch {
  pkBranch: number;
  name: string;
  address?: string | null;
  phone?: string | null;
  /** Horario de apertura en formato HH:mm. */
  opensAt?: string;
  /** Horario de cierre en formato HH:mm. */
  closesAt?: string;
  available?: boolean; // borrado lógico
  createdAt?: Date | null;
  updatedAt?: Date | null;
  /** Auditoria: la rellena el repositorio con el usuario del token. */
  createdBy?: string | null;
  updatedBy?: string | null;
}
