// src/core/di/logger.factory.ts
import type { ILogger } from "../../domain/interfaces/infrastructure/plugins/logger.plugin.interface";
import type { IEnvs } from "../../domain/interfaces/infrastructure/plugins/envs.plugin.interface";
import { PinoLoggerPlugin } from "../../infrastructure/plugins/pino.plugin";
import { WinstonPlugin } from "../../infrastructure/plugins/winston.plugin";

export type LoggerDriver = "pino" | "winston";

/**
 * Crea la implementación de ILogger según la env var LOG_DRIVER
 * ("pino" | "winston"), con "pino" por defecto. Permite conmutar de logger
 * sin tocar el resto del cableado. Falla de forma ruidosa ante un valor desconocido.
 */
export function createLogger(envs: IEnvs): ILogger {
  const driver = (envs.getEnv("LOG_DRIVER") || "pino").toLowerCase();
  const level = envs.getEnv("LOG_LEVEL") || "debug";
  const service = envs.getEnv("SERVICE_NAME") || "api-ts-express";

  switch (driver) {
    case "winston":
      return new WinstonPlugin({ level, service });
    case "pino":
      return new PinoLoggerPlugin({ service, level });
    default:
      throw new Error(
        `[config] Unknown LOG_DRIVER "${driver}". Valid values: pino, winston.`
      );
  }
}
