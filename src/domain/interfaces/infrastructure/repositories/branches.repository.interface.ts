// src/domain/interfaces/infrastructure/repositories/branches.repository.interface.ts
import { IBranch } from "../../../models/branches.model";
import { IGenericRepository } from "./generic.repository.interface";

/**
 * Sucursales: todo lo que necesita el módulo ya lo cubre el repositorio
 * genérico, así que la interfaz sólo fija el tipo de la entidad. Si más adelante
 * hiciera falta una consulta que el genérico no exprese (un GROUP BY, una vista,
 * un procedimiento), se añade aquí como método extra —igual que hace
 * `IAppointmentsRepository`— sin perder el CRUD heredado.
 */
export type IBranchesRepository = IGenericRepository<IBranch>;
