// src/presentation/routes/index.route.ts
import express, { Application, Router } from "express";
import { container } from "tsyringe";
import { UsersRoutes } from "./users.route";
import { BranchesRoutes } from "./branches.route";
import { AppointmentsRoutes } from "./appointments.route";
import { IdentityRoutes } from "./identity.route";
import { AuditRoutes } from "./audit.route";
import { TestRoutes } from "./test.route";
import { resolveApiPrefix, resolveLegacyPrefix } from "../../core/config/api.config";
import type { IEnvs } from "../../domain/interfaces/infrastructure/plugins/envs.plugin.interface";
import { TOKENS } from "../../core/di/tokens";

export class IndexRoutes {
  /**
   * Monta todos los módulos bajo el prefijo configurado (`API_PREFIX`, por
   * defecto `/api/v1`) y, si sigue activo, bajo el alias sin versión.
   *
   * Cuando exista una v2 no saldrá de la configuración: las dos versiones
   * tendrán que responder a la vez, así que serán dos montajes aquí, cada uno
   * con su router y sus DTOs. Lo que la variable mueve es *dónde* vive esta
   * API, no *qué* contrato sirve.
   */
  public static register(app: Application) {
    const envs: IEnvs = container.resolve(TOKENS.IEnvs);

    const v1 = express.Router();
    this.registerV1(v1);

    app.use(resolveApiPrefix(envs), v1);

    const legacy = resolveLegacyPrefix(envs);
    if (legacy) app.use(legacy, v1);
  }

  /**
   * Los módulos de la v1. Se resuelven por el contenedor aquí, en la raíz de
   * composición, en vez de que cada clase pida las suyas por su cuenta: así sus
   * dependencias se ven en la firma y un test puede construirlas con dobles sin
   * montar el contenedor entero.
   */
  private static registerV1(router: Router): void {
    container.resolve(UsersRoutes).register(router);
    container.resolve(BranchesRoutes).register(router);
    container.resolve(AppointmentsRoutes).register(router);
    container.resolve(IdentityRoutes).register(router);
    container.resolve(AuditRoutes).register(router);

    // Rutas de desarrollo: generación de token y subida de ficheros.
    container.resolve(TestRoutes).register(router);
  }
}
