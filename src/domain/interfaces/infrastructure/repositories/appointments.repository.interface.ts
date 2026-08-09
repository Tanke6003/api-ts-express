// src/domain/interfaces/infrastructure/repositories/appointments.repository.interface.ts
import { AppointmentStatus, IAppointment } from "../../../models/appointments.model";
import { IGenericRepository } from "./generic.repository.interface";

export interface AppointmentStatusCount {
  status: AppointmentStatus;
  total: number;
}

/**
 * Citas: el CRUD y las consultas por filtro salen del repositorio genérico; esta
 * interfaz sólo añade lo que el genérico no sabe expresar.
 *
 * `countByStatus` es un `GROUP BY`, que queda fuera del lenguaje de filtros del
 * repositorio genérico a propósito: ampliarlo con agregaciones lo convertiría en
 * un ORM completo. Cuando aparece un caso así, se declara aquí y el repositorio
 * concreto lo resuelve con SQL.
 */
export interface IAppointmentsRepository extends IGenericRepository<IAppointment> {
  /** Total de citas vivas por estado, opcionalmente acotado a una sucursal. */
  countByStatus(fkBranch?: number): Promise<AppointmentStatusCount[]>;
}
