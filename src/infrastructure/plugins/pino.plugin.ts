// src/infrastructure/plugins/pinoLogger.plugin.ts
import pino, { Logger } from "pino";
import pinoHttp from "pino-http";
import { ILogger } from "../../domain/interfaces/infrastructure/plugins/logger.plugin.interface";
import { injectable } from "tsyringe";

@injectable()
export class PinoLoggerPlugin implements ILogger {
  private logger: Logger;
  private httpMw: ReturnType<typeof pinoHttp>;

  constructor(opts?: {
    level?: string;
    service?: string;
    env?: string;
    version?: string;
  }) {
    this.logger = pino({
      level: opts?.level ?? process.env.LOG_LEVEL ?? "info",
      base: {
        service: opts?.service ?? process.env.SERVICE_NAME ?? "api",
        env: opts?.env ?? process.env.NODE_ENV ?? "dev",
        version: opts?.version ?? process.env.APP_VERSION ?? "dev",
      },
      timestamp: pino.stdTimeFunctions.isoTime,
    });

    this.httpMw = pinoHttp({
      logger: this.logger,
      customSuccessMessage: () => "http_access",
      customErrorMessage: () => "http_error",
      customProps: (req, res) => ({
        reqId:
          (req.headers?.["x-request-id"] as string) ||
          (req.headers?.["x-amzn-trace-id"] as string),
        path: req.url,
        method: req.method,
        userAgent: req.headers?.["user-agent"],
        ip:
          (req.headers?.["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
          (req.socket as any)?.remoteAddress,
      }),
    });
  }

  log(level: string, message: string, meta?: object): void {
    this.logger[level as "info" | "error" | "warn" | "debug"]?.(
      meta ? { ...meta, msg: message } : { msg: message }
    );
  }
  info(message: string, meta?: object): void {
    this.logger.info(meta ? { ...meta, msg: message } : { msg: message });
  }
  warn(message: string, meta?: object): void {
    this.logger.warn(meta ? { ...meta, msg: message } : { msg: message });
  }
  error(message: string, meta?: object): void {
    this.logger.error(meta ? { ...meta, msg: message } : { msg: message });
  }
  debug(message: string, meta?: object): void {
    this.logger.debug(meta ? { ...meta, msg: message } : { msg: message });
  }

  // Llamar una vez por request (como middleware Express)
  http(req: any, res: any): void {
    this.httpMw(req, res, () => {});
  }
}
