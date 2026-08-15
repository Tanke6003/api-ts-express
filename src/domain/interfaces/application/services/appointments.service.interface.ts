// src/domain/interfaces/application/services/appointments.service.interface.ts
import type { ICrudService } from "../../../../application/services/crud.service";
import type { AppointmentDTO } from "../../../../application/dtos/appointments.dtos";
import type { AppointmentStatusCount } from "../../infrastructure/repositories/appointments.repository.interface";

/**
 * El contrato del CRUD más lo propio de una cita.
 *
 * Que hable el contrato genérico no significa que lo herede: el servicio de
 * citas lo implementa a mano porque cada lectura suya es compuesta —diez
 * filtros y la resolución de sucursal y cliente—. Lo que sí gana con esto es
 * que su controlador pueda heredar de `CrudController`.
 */
export interface IAppointmentsService extends ICrudService<AppointmentDTO> {
  restore(id: number): Promise<boolean>;
  hardDelete(id: number): Promise<boolean>;
  /** Totales por estado (GROUP BY), opcionalmente acotados a una sucursal. */
  getStats(branchId?: number): Promise<AppointmentStatusCount[]>;
}
