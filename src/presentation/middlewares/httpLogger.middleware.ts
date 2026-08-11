import { container } from "tsyringe";
import { ILogger } from "../../domain/interfaces/infrastructure/plugins/logger.plugin.interface";
import { TOKENS } from "../../core/di/tokens";

export function httpLoggerMiddleware(req: any, res: any, next: () => void) {
  const logger: ILogger = container.resolve(TOKENS.ILogger);
  logger.http()(req, res, next);
}
