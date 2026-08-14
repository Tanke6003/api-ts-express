// src/core/config/swagger.config.ts
import { container } from "tsyringe";
import { IEnvs } from "../../domain/interfaces/infrastructure/plugins/envs.plugin.interface";
import { Options } from "swagger-jsdoc";
import { TOKENS } from "../di/tokens";
import { resolveApiPrefix } from "./api.config";

export const getSwaggerOptions = (): Options => {
  const envs: IEnvs = container.resolve(TOKENS.IEnvs);

  return {
    definition: {
      openapi: "3.0.0",
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
    apis: ["./src/presentation/routes/*.ts", "./src/application/dtos/*.ts"],
  };
};
