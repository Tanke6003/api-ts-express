import { Request, Response, NextFunction } from "express";
import { AppError } from "../../core/errors/app-error";
import { container } from "tsyringe";
import type { ILogger } from "../../domain/interfaces/infrastructure/plugins/logger.plugin.interface";

function resolveLogger(): ILogger | null {
  try {
    return container.resolve("ILogger");
  } catch {
    return null;
  }
}

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const logger = resolveLogger();

  if (err instanceof AppError) {
    if (!err.isOperational) logger?.error(err.message, { stack: err.stack });
    res.status(err.statusCode).json({
      status: "error",
      message: err.message,
    });
    return;
  }

  logger?.error("Unhandled error", { message: err.message, stack: err.stack });
  res.status(500).json({
    status: "error",
    message: "Internal server error",
  });
};
