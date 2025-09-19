// src/domain/interfaces/logger
export interface ILogger {
  log(level: string, message: string, meta?: object): void;
  http(req: any, res: any): void;
  info(message: string, meta?: object): void;
  error(message: string, meta?: object): void;
  warn(message: string, meta?: object): void;
  debug(message: string, meta?: object): void;
}
