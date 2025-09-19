import { WinstonPlugin } from "../../infrastructure/plugins/winston.plugin";

const logger = new WinstonPlugin();

export function httpLoggerMiddleware(req: any, res: any, next: () => void) {
  logger.http(req, res);
  next();
}
