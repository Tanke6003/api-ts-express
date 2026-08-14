// src/core/di/modules/features/appointments.module.ts
import { container } from "tsyringe";
import type { IAppointmentsRepository } from "../../../../domain/interfaces/infrastructure/repositories/appointments.repository.interface";
import type { IAppointmentsService } from "../../../../domain/interfaces/application/services/appointments.service.interface";
import type { IAppointmentsController } from "../../../../domain/interfaces/presentation/controllers/appointments.controller.interface";
import { AppointmentsRepository } from "../../../../infrastructure/repositories/appointments.repository";
import { AppointmentsService } from "../../../../application/services/appointments.service";
import { AppointmentsController } from "../../../../presentation/controllers/appointments.controller";
import { TOKENS } from "../../tokens";

/** Citas: el otro ejemplo del dominio. Depende de sucursales y de usuarios. */
export function registerAppointments(): void {
  container.register<IAppointmentsRepository>(TOKENS.IAppointmentsRepository, {
    useClass: AppointmentsRepository,
  });
  container.register<IAppointmentsService>(TOKENS.IAppointmentsService, {
    useClass: AppointmentsService,
  });
  container.register<IAppointmentsController>(TOKENS.IAppointmentsController, {
    useClass: AppointmentsController,
  });
}
