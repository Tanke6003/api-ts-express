// src/infrastructure/plugins/winston.plugin.ts
import winston from "winston";
import path from "path";

export class WinstonPlugin {
  private logger: winston.Logger;

  constructor() {
    const level = "info";

    this.logger = winston.createLogger({
      level,
      format: winston.format.combine(
        winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        // Formato para consola: color + legible
        winston.format.printf(({ timestamp, level, message, ...meta }) =>
          `${timestamp} [${level.toUpperCase()}]: ${message} ${
            Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ""
          }`
        )
      ),
      transports: this.getTransports(),
    });
  }

  private getTransports(): winston.transport[] {
    const logDir = path.resolve(__dirname, "../../logs");
    const transports: winston.transport[] = [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize({ all: true }),
          winston.format.simple(),
          winston.format.metadata(),
          winston.format.printf(
            ({ timestamp, level, message, ...meta }) =>
              `${timestamp} [${level.toUpperCase()}]: ${message} ${
                Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ""
              }`
          )
        ),
      }),
      // Archivos por nivel
      new winston.transports.File({
        filename: path.join(logDir, "error.log"),
        level: "error",
      }),
      new winston.transports.File({
        filename: path.join(logDir, "combined.log"),
      }),
      new winston.transports.File({
        filename: path.join(logDir, "debug.log"),
        level: "debug",
      }),
      new winston.transports.File({
        filename: path.join(logDir, "warn.log"),
        level: "warn",
      }),
      new winston.transports.File({
        filename: path.join(logDir, "info.log"),
        level: "info",
      }),
      new winston.transports.File({
        filename: path.join(logDir, "http.log"),
        level: "http",
        format: winston.format.combine(
          winston.format.timestamp(),
          // Guardamos logs HTTP en JSON estructurado
          winston.format.json()
        ),
      }),
    ];

    return transports;
  }

  // Método genérico
  log(level: string, message: string, meta: object = {}) {
    this.logger.log(level, message, meta);
  }

  // Middleware para logs HTTP
  http(req: any, res: any) {
    const { method, originalUrl, headers, ip } = req;

    res.on("finish", () => {
      const { statusCode } = res;

      this.log("http", "HTTP Request", {
        timestamp: new Date().toISOString(),
        type: "request",
        ip,
        method,
        endpoint: originalUrl,
        status: statusCode,
        userAgent: headers["user-agent"],
      });
    });
  }

  // Métodos de nivel
  info(message: string, meta: object = {}) {
    this.log("info", message, meta);
  }

  error(message: string, meta: object = {}) {
    this.log("error", message, meta);
  }

  warn(message: string, meta: object = {}) {
    this.log("warn", message, meta);
  }

  debug(message: string, meta: object = {}) {
    this.log("debug", message, meta);
  }
}
