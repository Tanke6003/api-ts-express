// src/infrastructure/plugins/pinoLogger.plugin.ts
import pino, { Logger } from "pino";
import pinoHttp from "pino-http";
import { ILogger } from "../../domain/interfaces/infrastructure/plugins/logger.plugin.interface";
import { container, injectable } from "tsyringe";
import { IEnvs } from "../../domain/interfaces/infrastructure/plugins/envs.plugin.interface";

@injectable()
export class PinoLoggerPlugin implements ILogger {
  private logger: Logger;
  private httpMidleWare: ReturnType<typeof pinoHttp>;
  private envs: IEnvs = container.resolve("IEnvs");

  constructor(opts?: { level?: string; service?: string; env?: string; version?: string }) {
    const env = (opts?.env ?? this.envs.getEnv("NODE_ENV") ?? "dev").toString();
    const isDev = /^(dev|development)$/i.test(env);

    const level = opts?.level ?? this.envs.getEnv("LOG_LEVEL") ?? (isDev ? "trace" : "info");
    const service = opts?.service ?? this.envs.getEnv("SERVICE_NAME") ?? "api";
    const version = opts?.version ?? this.envs.getEnv("API_VERSION") ?? "dev";

    // Pretty automático SOLO en dev (si no está, cae a JSON)
    let transport: any;
    if (isDev) {
      try {
        transport = pino.transport({
          target: "pino-pretty",
          options: {
            singleLine: true,
            colorize: true,
            translateTime: "SYS:isoTime",
            ignore: "pid,hostname"
          }
        });
      } catch {
        console.warn("[Pino] 'pino-pretty' no está instalado. Usando JSON logs.");
      }
    }

    this.logger = pino(
      {
        level,
        base: { service, env, version },
        timestamp: pino.stdTimeFunctions.isoTime,
        redact: {
          paths: [
            "req.headers.authorization",
            "req.headers.cookie",
            "headers.authorization",
            "password",
            "authorization"
          ],
          remove: true
        }
      },
      transport
    );

    this.httpMidleWare = pinoHttp({
      logger: this.logger,
      customSuccessMessage: undefined,
      customErrorMessage: (_req, _res, err) => err?.message || "http_error",
      customLogLevel: (_req, res, err) => {
        if (err) return "error";
        if (res.statusCode >= 500) return "error";
        if (res.statusCode >= 400) return "warn";
        return "info";
      },
      autoLogging: true,
    });
  }

  log(level: string, message: string, meta?: object): void {
    this.logger[level as "info" | "error" | "warn" | "debug" | "trace"]?.(
      meta ? { ...meta, msg: message } : { msg: message }
    );
  }
  info(message: string, meta?: object): void { this.logger.info(meta ? { ...meta, msg: message } : { msg: message }); }
  warn(message: string, meta?: object): void { this.logger.warn(meta ? { ...meta, msg: message } : { msg: message }); }
  error(message: string, meta?: object): void { this.logger.error(meta ? { ...meta, msg: message } : { msg: message }); }
  debug(message: string, meta?: object): void { this.logger.debug(meta ? { ...meta, msg: message } : { msg: message }); }
  trace(message: string, meta?: object): void { (this.logger as any).trace?.(meta ? { ...meta, msg: message } : { msg: message }); }

  // Monta esto directo en Express
  http() {
    return this.httpMidleWare;
  }
}
