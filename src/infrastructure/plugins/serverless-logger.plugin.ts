import { ILogger } from "../../domain/interfaces/infrastructure/plugins/logger.plugin.interface";

export class ServerlessLoggerPlugin implements ILogger {
  log(level: string, message: string, meta?: object): void {
    const payload = meta ? { ...meta, message } : { message };
    console.log(JSON.stringify({ level, ...payload }));
  }

  info(message: string, meta?: object): void {
    this.log("info", message, meta);
  }

  error(message: string, meta?: object): void {
    this.log("error", message, meta);
  }

  warn(message: string, meta?: object): void {
    this.log("warn", message, meta);
  }

  debug(message: string, meta?: object): void {
    this.log("debug", message, meta);
  }

  http() {
    return (req: any, res: any, next: any) => {
      const start = Date.now();
      const done = () => {
        const duration = Date.now() - start;
        this.info("http", {
          method: req.method,
          url: req.originalUrl || req.url,
          statusCode: res.statusCode,
          duration,
        });
      };

      res.on("finish", done);
      res.on("close", done);
      next();
    };
  }
}
