import { container } from "tsyringe";
import { ILogger } from "../../domain/interfaces/infrastructure/plugins/logger.plugin.interface";



export function httpLoggerMiddleware(req: any, res: any, next: () => void) {
  const logger:ILogger = container.resolve("ILogger");
  logger.http(req, res);
  next();
}
