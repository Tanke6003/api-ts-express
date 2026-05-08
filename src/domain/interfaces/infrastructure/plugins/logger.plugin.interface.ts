// src/domain/interfaces/logger
import { RequestHandler } from "express";

export interface ILogger {
  log(level: string, message: string, meta?: object): void;
  http(): RequestHandler;
  info(message: string, meta?: object): void;
  error(message: string, meta?: object): void;
  warn(message: string, meta?: object): void;
  debug(message: string, meta?: object): void;
}
