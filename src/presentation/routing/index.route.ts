// src/presentation/routes/index.route.ts
import express, { Application, Router } from "express";
import { container } from "tsyringe";
import { registerController } from "./router.builder";
import { registeredControllers } from "./route.decorators";
import { resolveApiPrefix, resolveLegacyPrefix } from "../../core/config/api.config";
import type { IEnvs } from "../../domain/interfaces/infrastructure/plugins/envs.plugin.interface";
import type { ITokenPlugin } from "../../domain/interfaces/infrastructure/plugins/token.plugin.interface";
import { TOKENS } from "../../core/di/tokens";

// Importar el controlador es lo que ejecuta sus decoradores y lo mete en el
// registro. Es la única lista que queda —una línea por módulo— y no se puede
// evitar sin escanear el disco en tiempo de ejecución, que costaría más de lo
// que ahorra. Todo lo demás (rutas, prefijo, token, documentación) sale del
// propio controlador.
import "../controllers/users.controller";
import "../controllers/branches.controller";
import "../controllers/appointments.controller";
import "../controllers/identity.controller";
import "../controllers/audit.controller";
import "../controllers/dev.controller";

export class IndexRoutes {
  /**
   * Monta todos los módulos bajo el prefijo configurado (`API_PREFIX`, por
   * defecto `/api/v1`) y, si sigue activo, bajo el alias sin versión.
   *
   * Cuando exista una v2 no saldrá de la configuración: las dos versiones
   * tendrán que responder a la vez, así que serán dos routers montados aquí.
   * Lo que la variable mueve es *dónde* vive la API, no *qué* contrato sirve.
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
   * Recorre el registro de controladores decorados y monta cada uno.
   *
   * Aquí no hay ni una ruta escrita ni una tabla de módulos que mantener: la
   * clase aporta sus rutas y su token, y el contenedor dice quién las atiende
   * —la implementación real o el doble que haya puesto un test—.
   */
  private static registerV1(router: Router): void {
    const jwt = container.resolve<ITokenPlugin>(TOKENS.ITokenPlugin);

    for (const [type, metadata] of registeredControllers()) {
      if (!metadata.token) {
        throw new Error(
          `[routes] ${(type as { name?: string }).name ?? "Un controlador"} está decorado con ` +
            "@ApiController pero no declara `token`, así que no se sabe quién debe atenderlo."
        );
      }

      registerController(
        router,
        type as new (...args: never[]) => object,
        container.resolve(metadata.token),
        jwt.middleware
      );
    }
  }
}
