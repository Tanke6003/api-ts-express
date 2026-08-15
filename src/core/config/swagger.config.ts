// src/core/config/swagger.config.ts
//
// El documento de OpenAPI, generado entero.
//
// No queda ni un comentario `@openapi` en el proyecto: las rutas las declaran
// los decoradores del controlador y los esquemas salen de Zod. Además de
// ahorrar el YAML, eso arregla un problema que la generación por comentarios
// tenía de raíz: swagger-jsdoc los leía de `./src/**/*.ts`, que no existe en el
// contenedor de producción, y `removeComments: true` los borraba del compilado.
// La documentación era correcta en desarrollo y quedaba vacía en producción.
import { container } from "tsyringe";
import { IEnvs } from "../../domain/interfaces/infrastructure/plugins/envs.plugin.interface";
import { TOKENS } from "../di/tokens";
import { resolveApiPrefix } from "./api.config";
import {
  buildOpenApiPaths,
  ERROR_RESPONSE_SCHEMA,
  ERROR_SCHEMA_NAME,
} from "../../presentation/routing/openapi.builder";
import { registeredControllers } from "../../presentation/routing/route.decorators";
import { buildDtoComponents } from "../../application/dtos/dto.registry";

// Carga los DTOs para que se registren. Se importan como tipos en todas partes,
// y un import de tipo no ejecuta el módulo.
import "../../application/dtos";

/** Documento completo, tal y como lo sirven Swagger, Scalar y `/api/openapi.json`. */
export const buildOpenApiSpec = (): Record<string, unknown> => {
  const envs: IEnvs = container.resolve(TOKENS.IEnvs);

  return {
    // 3.1 y no 3.0 porque su esquema *es* JSON Schema 2020-12, que es
    // exactamente lo que emite Zod. Con 3.0 habría que traducir cada esquema
    // generado a sus diferencias (`nullable`, `exclusiveMinimum` booleano…) y
    // esa traducción es justo la clase de código que esto elimina.
    openapi: "3.1.0",
    info: {
      // Nombre y versión salen del entorno: `API_VERSION` es la versión
      // *publicada* del servicio, la que cambia en cada release. No confundir
      // con el `/v1` de la ruta, que es la versión del contrato.
      title: envs.getEnv("SERVICE_NAME") || "API",
      version: envs.getEnv("API_VERSION") || "1.0.0",
      description: "REST API template on Node.js, Express 5 and TypeScript",
    },
    servers: [
      {
        // Relativo, para que la documentación funcione detrás de cualquier
        // dominio y no sólo en localhost. Las rutas cuelgan de aquí, así que se
        // declaran sin prefijo (`/users`), y si se mueve `API_PREFIX` el
        // "Try it out" sigue apuntando donde toca.
        url: resolveApiPrefix(envs),
        description: "Versión vigente",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          description:
            'JWT Authorization header using the Bearer scheme. Example: "Authorization: Bearer {token}"',
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        ...buildDtoComponents(),
        // El sobre de error es común a toda la API, así que se declara una vez
        // y lo referencian todas las respuestas de fallo.
        [ERROR_SCHEMA_NAME]: ERROR_RESPONSE_SCHEMA,
      },
    },
    security: [{ bearerAuth: [] }],
    paths: buildOpenApiPaths(registeredControllers().map(([, metadata]) => metadata)),
  };
};
