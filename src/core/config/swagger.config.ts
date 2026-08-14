// src/core/config/swagger.config.ts
import { container } from "tsyringe";
import { IEnvs } from "../../domain/interfaces/infrastructure/plugins/envs.plugin.interface";
import swaggerJsdoc, { Options } from "swagger-jsdoc";
import { TOKENS } from "../di/tokens";
import { resolveApiPrefix } from "./api.config";
import { buildOpenApiPaths } from "../../presentation/routing/openapi.builder";
import { registeredControllers } from "../../presentation/routing/route.decorators";

export const getSwaggerOptions = (): Options => {
  const envs: IEnvs = container.resolve(TOKENS.IEnvs);

  return {
    definition: {
      // 3.1 y no 3.0 porque su esquema *es* JSON Schema 2020-12, que es
      // exactamente lo que emite Zod. Con 3.0 habría que traducir cada esquema
      // generado a sus diferencias (`nullable`, `exclusiveMinimum` booleano…) y
      // esa traducción es justo la clase de código que este cambio elimina.
      openapi: "3.1.0",
      info: {
        // Nombre y versión salen del entorno: `API_VERSION` es la versión
        // *publicada* del servicio, la que cambia en cada release. No confundir
        // con el `/api/v1` de la ruta, que es la versión del contrato y vive en
        // el código porque una v2 tendría que convivir con ella.
        title: envs.getEnv("SERVICE_NAME") || "API",
        version: envs.getEnv("API_VERSION") || "1.0.0",
        description: "REST API template on Node.js, Express 5 and TypeScript",
      },
      servers: [
        {
          // Relativo, para que la documentación funcione detrás de cualquier
          // dominio y no sólo en localhost. Las rutas de las anotaciones cuelgan
          // de aquí, así que se escriben sin prefijo (`/users`), y si se mueve
          // `API_PREFIX` el "Try it out" sigue apuntando donde toca.
          url: resolveApiPrefix(envs),
          description: "Versión vigente",
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            description:
              "JWT Authorization header using the Bearer scheme. Example: \"Authorization: Bearer {token}\"",
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
      security: [{ bearerAuth: [] }],
    },
    // Los módulos que aún declaran sus rutas en un fichero aparte siguen
    // documentándose con sus bloques `@openapi`. Los decorados no aparecen
    // aquí: su documentación la genera `buildOpenApiPaths` a partir de los
    // mismos metadatos que montan las rutas.
    apis: ["./src/presentation/routes/*.ts", "./src/application/dtos/*.ts"],
  };
};

/**
 * Especificación completa: lo que saca swagger-jsdoc de los comentarios más lo
 * que sale de los controladores decorados.
 *
 * Se fusiona en vez de elegir uno de los dos porque durante la migración
 * conviven las dos formas. Cuando no quede ningún fichero de rutas, `apis`
 * puede quedarse sólo con los DTOs y swagger-jsdoc dejará de hacer falta.
 */
export const buildOpenApiSpec = (): Record<string, unknown> => {
  const fromComments = swaggerJsdoc(getSwaggerOptions()) as Record<string, unknown>;
  const fromDecorators = buildOpenApiPaths(
    registeredControllers().map(([, metadata]) => metadata)
  );

  return {
    ...fromComments,
    paths: { ...((fromComments.paths as object) ?? {}), ...fromDecorators },
  };
};
