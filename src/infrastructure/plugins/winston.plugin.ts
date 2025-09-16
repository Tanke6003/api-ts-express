// src/infrastructure/plugins/winston.plugin.ts
import winston from "winston";
import path from "path";
// Remove ESM-specific fileURLToPath and import.meta.url usage
// Use CommonJS __filename and __dirname provided by Node.js

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
       let logDir = path.resolve(__dirname, '../../logs');
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
        
          filename: path.join(logDir,"error.log"),
          level: "error",

        }),
        new winston.transports.File({
          filename: path.join(logDir,"combined.log")
        }),
        new winston.transports.File({
            filename : path.join(logDir,"debug.log"),
            level: "debug",
            }),
        new winston.transports.File({
            filename: path.join(logDir,"warn.log"),
            level: "warn",
            }),
        new winston.transports.File({
            filename: path.join(logDir,"info.log"),
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
