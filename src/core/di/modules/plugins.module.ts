// src/core/di/modules/plugins.module.ts
import { container } from "tsyringe";
import type { IEnvs } from "../../../domain/interfaces/infrastructure/plugins/envs.plugin.interface";
import type { ILogger } from "../../../domain/interfaces/infrastructure/plugins/logger.plugin.interface";
import type { IRequestContext } from "../../../domain/interfaces/infrastructure/plugins/request-context.plugin.interface";
import type { ITokenPlugin } from "../../../domain/interfaces/infrastructure/plugins/token.plugin.interface";
import type { IFileStorage } from "../../../domain/interfaces/infrastructure/plugins/fileStorage.plugin.interface";
import { DotenvPlugin } from "../../../infrastructure/plugins/dotenv.plugin";
import { AsyncRequestContextPlugin } from "../../../infrastructure/plugins/asyncRequestContext.plugin";
import { JwtPlugin } from "../../../infrastructure/plugins/jwt.plugin";
import { NativeFileStoragePlugin } from "../../../infrastructure/plugins/nativeFileStorage.plugin";
import { validateCriticalEnvs } from "../../config/env.validation";
import { createLogger } from "../logger.factory";
import { TOKENS } from "../tokens";

/** Lo que el resto del cableado necesita tener ya resuelto. */
export interface Plugins {
  envs: IEnvs;
  logger: ILogger;
  requestContext: IRequestContext;
}

/**
 * Servicios transversales, en el único orden en que se pueden registrar: las
 * env vars primero porque de ellas salen el secreto y el driver de log, y el
 * contexto de petición antes que la persistencia porque de él sale el usuario
 * que el repositorio genérico escribe en las columnas de auditoría.
 */
export function registerPlugins(): Plugins {
  container.registerSingleton<IEnvs>(TOKENS.IEnvs, DotenvPlugin);
  const envs = container.resolve<IEnvs>(TOKENS.IEnvs);

  // Falla de forma ruidosa si faltan secretos críticos, en vez de degradarse
  // silenciosamente con valores por defecto inseguros.
  validateCriticalEnvs(envs);

  // El logger se elige con LOG_DRIVER ("pino" | "winston"), pino por defecto.
  container.register<ILogger>(TOKENS.ILogger, { useValue: createLogger(envs) });
  const logger = container.resolve<ILogger>(TOKENS.ILogger);

  // AsyncLocalStorage: singleton obligatorio, porque el almacén tiene que ser el
  // mismo que abre el middleware y lee el repositorio.
  container.registerSingleton<IRequestContext>(TOKENS.IRequestContext, AsyncRequestContextPlugin);
  const requestContext = container.resolve<IRequestContext>(TOKENS.IRequestContext);

  // Singleton: el secreto se valida y se guarda en el constructor, así que
  // rehacerlo en cada resolución sólo repetiría trabajo.
  container.registerSingleton<ITokenPlugin>(TOKENS.ITokenPlugin, JwtPlugin);

  // También singleton, y aquí importa más: el constructor crea el directorio de
  // subidas. Registrado como clase no se toca el disco hasta que alguien lo pida.
  container.registerSingleton<IFileStorage>(TOKENS.IFileStorage, NativeFileStoragePlugin);

  return { envs, logger, requestContext };
}
