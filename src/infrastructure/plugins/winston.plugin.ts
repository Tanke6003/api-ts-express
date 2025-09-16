// src/infrastructure/plugins/winston.plugin.ts
import winston from "winston";

export class WinstonPlugin {
  private logger: winston.Logger;

  constructor() {
    const level = "info"

    this.logger = winston.createLogger({
      level,
      format: winston.format.combine(
        winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
        winston.format.printf(
          ({ timestamp, level, message, ...meta }) =>
            `${timestamp} [${level.toUpperCase()}]: ${message} ${
              Object.keys(meta).length ? JSON.stringify(meta) : ""
            }`
        )
      ),
      transports: this.getTransports(),
    });
  }

  private getTransports(): winston.transport[] {
    const transports: winston.transport[] = [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize({ all: true }),
          winston.format.simple(),
          winston.format.metadata(),
            winston.format.printf(
                ({ timestamp, level, message, ...meta }) =>
                    `${timestamp} [${level}]: ${message} ${
                        Object.keys(meta).length ? JSON.stringify(meta) : ""
                    }`
            )   
        ),
      }),
    ];

   
      transports.push(
        new winston.transports.File({
          filename: "logs/error.log",
          level: "error",
        }),
        new winston.transports.File({
          filename: "logs/combined.log",
        }),
        new winston.transports.File({
            filename: "logs/debug.log",
            level: "debug",
            }),
        new winston.transports.File({
            filename: "logs/warn.log",
            level: "warn",
            }),
        new winston.transports.File({
            filename: "logs/info.log",
            level: "info",
            })
        
      );


    return transports;
  }

  log(level: string, message: string, meta: object = {}) {
    this.logger.log(level, message, meta);
  }

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
