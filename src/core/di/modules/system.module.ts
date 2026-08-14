// src/core/di/modules/system.module.ts
import { container } from "tsyringe";
import type { IIdentityController } from "../../../domain/interfaces/presentation/controllers/identity.controller.interface";
import type { IAuditController } from "../../../domain/interfaces/presentation/controllers/audit.controller.interface";
import { IdentityController } from "../../../presentation/controllers/identity.controller";
import { AuditController } from "../../../presentation/controllers/audit.controller";
import { DevController } from "../../../presentation/controllers/dev.controller";
import { TOKENS } from "../tokens";

/**
 * Lo que la plantilla ofrece por sí misma, sin dominio detrás: quién es el
 * usuario de la petición y la bitácora de cambios. Ninguno tiene servicio ni
 * repositorio propios —identidad sale del contexto y la bitácora lee el store
 * genérico—, así que comparten fichero en vez de tener uno de tres líneas cada uno.
 */
export function registerSystem(): void {
  container.register<IIdentityController>(TOKENS.IIdentityController, {
    useClass: IdentityController,
  });
  container.register<IAuditController>(TOKENS.IAuditController, { useClass: AuditController });
  container.register(TOKENS.IDevController, { useClass: DevController });
}
