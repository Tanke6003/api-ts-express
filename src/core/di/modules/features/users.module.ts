// src/core/di/modules/features/users.module.ts
import { container } from "tsyringe";
import type { IUsersRepository } from "../../../../domain/interfaces/infrastructure/repositories/users.repository.interface";
import type { IUsersService } from "../../../../domain/interfaces/application/services/users.service.interface";
import type { IUsersController } from "../../../../domain/interfaces/presentation/controllers/users.controller.interface";
import { UsersRepository } from "../../../../infrastructure/repositories/users.repository";
import { UsersService } from "../../../../application/services/users.service";
import { UsersController } from "../../../../presentation/controllers/users.controller";
import { TOKENS } from "../../tokens";

/**
 * Las tres capas del módulo de usuarios. Transitorias a propósito: no guardan
 * estado entre peticiones y las rutas las resuelven una sola vez al arrancar,
 * así que hacerlas singleton no ahorraría nada y sí escondería un estado
 * accidental el día que alguien añada un campo a la clase.
 */
export function registerUsers(): void {
  container.register<IUsersRepository>(TOKENS.IUsersRepository, { useClass: UsersRepository });
  container.register<IUsersService>(TOKENS.IUsersService, { useClass: UsersService });
  container.register<IUsersController>(TOKENS.IUsersController, { useClass: UsersController });
}
