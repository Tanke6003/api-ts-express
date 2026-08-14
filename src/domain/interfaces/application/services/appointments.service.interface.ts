// src/domain/interfaces/application/services/appointments.service.interface.ts
import {
  AppointmentDTO,
  AppointmentQueryDTO,
  CreateAppointmentDTO,
  UpdateAppointmentDTO,
} from "../../../../application/dtos/appointments.dtos";
import { PaginatedDTO } from "../../../../application/dtos/common.dtos";
import { AppointmentStatusCount } from "../../infrastructure/repositories/appointments.repository.interface";

export interface IAppointmentsService {
  /** Consulta compuesta: filtros combinados + resolución de sucursal y cliente. */
  getAll(query: AppointmentQueryDTO): Promise<PaginatedDTO<AppointmentDTO>>;
  getById(id: number): Promise<AppointmentDTO | null>;
  create(appointment: CreateAppointmentDTO): Promise<AppointmentDTO>;
  update(id: number, appointment: UpdateAppointmentDTO): Promise<AppointmentDTO | null>;
  softDelete(id: number): Promise<boolean>;
  restore(id: number): Promise<boolean>;
  hardDelete(id: number): Promise<boolean>;
  /** Totales por estado (GROUP BY), opcionalmente acotados a una sucursal. */
  getStats(branchId?: number): Promise<AppointmentStatusCount[]>;
}
