import { Request, Response, NextFunction } from "express";
import { container } from "tsyringe";
import { normalizeError, causeChain } from "../../core/errors/error-mapper";
import { AppError } from "../../core/errors/app-error";
import type { ILogger } from "../../domain/interfaces/infrastructure/plugins/logger.plugin.interface";
import type { IRequestContext } from "../../domain/interfaces/infrastructure/plugins/request-context.plugin.interface";
import { REQUEST_ID_HEADER } from "./requestContext.middleware";

/**
 * El manejador debe seguir respondiendo aunque el contenedor no esté montado
 * (tests que instancian middlewares sueltos), de ahí la resolución tolerante.
 */
function resolveOptional<T>(token: string): T | null {
  try {
    return container.resolve<T>(token);
  } catch {
    return null;
  }
}

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Id de la petición: del contexto si está activo, si no de la cabecera. */
function resolveRequestId(req: Request, context: IRequestContext | null): string | undefined {
  const fromContext = context?.getRequestId();
  if (fromContext) return fromContext;

  const header = req.headers?.[REQUEST_ID_HEADER];
  return typeof header === "string" ? header : undefined;
}

/** Cadena de causas aplanada, que es donde suele estar el motivo real. */
function describeCauses(error: unknown): string[] {
  return causeChain(error)
    .slice(1)
    .map((link) => (link instanceof Error ? `${link.name}: ${link.message}` : String(link)));
}

/**
 * Manejador de errores global. Es el último middleware: cualquier `next(err)` o
 * excepción de un controlador acaba aquí.
 *
 * Tres responsabilidades:
 *  1. Traducir el error a una respuesta HTTP coherente (`normalizeError`).
 *  2. Registrarlo con todo el contexto —id de petición, usuario, ruta, causas—
 *     para poder reconstruir qué pasó.
 *  3. No filtrar detalles internos: en producción un 5xx inesperado responde un
 *     mensaje genérico, y la traza nunca sale al cliente.
 */
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const logger = resolveOptional<ILogger>("ILogger");
  const context = resolveOptional<IRequestContext>("IRequestContext");

  const normalized = normalizeError(err);
  const requestId = resolveRequestId(req, context);
  const user = context?.getCurrentUser() ?? null;

  const logPayload = {
    requestId,
    method: req.method,
    path: req.originalUrl ?? req.url,
    statusCode: normalized.statusCode,
    code: normalized.code,
    userId: user?.id ?? null,
    userName: user?.name ?? null,
    error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    causes: describeCauses(err),
    stack: err instanceof Error ? err.stack : undefined,
  };

  // Un 4xx es parte del funcionamiento normal: se registra, pero no como alarma.
  if (normalized.statusCode >= 500 || !normalized.isOperational) {
    logger?.error("Request failed", logPayload);
  } else {
    logger?.warn("Request rejected", logPayload);
  }

  // Un 5xx inesperado no debe describir el fallo interno al cliente.
  const exposeMessage = normalized.isOperational || normalized.statusCode < 500;

  const body: Record<string, unknown> = {
    status: "error",
    code: normalized.code,
    message: exposeMessage ? normalized.message : "Internal server error",
    requestId,
    timestamp: new Date().toISOString(),
    path: req.originalUrl ?? req.url,
    method: req.method,
  };

  if (normalized.errors?.length) body.errors = normalized.errors;

  // La traza y las causas sólo fuera de producción: son la información más útil
  // para depurar y la más peligrosa de publicar.
  if (!isProduction()) {
    body.stack = err instanceof Error ? err.stack?.split("\n").map((line) => line.trim()) : undefined;
    const causes = describeCauses(err);
    if (causes.length > 0) body.causes = causes;
  }

  res.status(normalized.statusCode).json(body);
};

/**
 * 404 para cualquier ruta no registrada. Se monta después de todas las rutas y
 * antes del manejador de errores, de modo que un endpoint mal escrito devuelva
 * el mismo formato de error que el resto de la API en vez del HTML de Express.
 */
export const notFoundHandler = (req: Request, _res: Response, next: NextFunction): void => {
  next(
    new AppError(`Cannot ${req.method} ${req.originalUrl ?? req.url}`, 404, true, {
      code: "ROUTE_NOT_FOUND",
    })
  );
};
