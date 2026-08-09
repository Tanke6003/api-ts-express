// src/core/errors/error-mapper.ts
import { ZodError } from "zod";
import { AppError, ErrorDetail } from "./app-error";

/**
 * Forma normalizada de cualquier error que llegue al manejador global: la capa
 * HTTP no tiene que saber si venía de Zod, del driver de Oracle o de un `throw`
 * suelto.
 */
export interface NormalizedError {
  statusCode: number;
  /** Código estable, pensado para que el cliente pueda ramificar sobre él. */
  code: string;
  message: string;
  errors?: ErrorDetail[];
  /** `false` marca los fallos que no esperábamos y merecen alarma en el log. */
  isOperational: boolean;
}

/**
 * Recorre la cadena de `cause`. Los repositorios envuelven los errores para no
 * filtrar detalles del driver hacia arriba, así que el motivo real está varios
 * niveles adentro.
 */
export function causeChain(error: unknown, maxDepth = 10): unknown[] {
  const chain: unknown[] = [];
  let current = error;

  for (let depth = 0; depth < maxDepth && current !== undefined && current !== null; depth++) {
    chain.push(current);
    current = current instanceof Error ? (current.cause as unknown) : undefined;
  }

  return chain;
}

/** Texto de toda la cadena, para buscar en él códigos del motor. */
function chainText(error: unknown): string {
  return causeChain(error)
    .map((link) => (link instanceof Error ? link.message : String(link)))
    .join(" | ");
}

/**
 * Errores de Oracle que corresponden a algo que hizo el cliente, y por tanto no
 * deben responderse como un 500 genérico. El resto cae al `default`.
 */
const ORACLE_ERRORS: Record<string, { statusCode: number; code: string; message: string }> = {
  "00001": {
    statusCode: 409,
    code: "DB_UNIQUE_VIOLATION",
    message: "Ya existe un registro con esos datos.",
  },
  "01400": {
    statusCode: 400,
    code: "DB_NOT_NULL_VIOLATION",
    message: "Falta un campo obligatorio.",
  },
  "02290": {
    statusCode: 400,
    code: "DB_CHECK_VIOLATION",
    message: "Los datos no cumplen una restricción de la tabla.",
  },
  "02291": {
    statusCode: 400,
    code: "DB_REFERENCE_NOT_FOUND",
    message: "La referencia indicada no existe.",
  },
  "02292": {
    statusCode: 409,
    code: "DB_REFERENCE_IN_USE",
    message: "No se puede eliminar: hay registros que dependen de este.",
  },
  "12899": {
    statusCode: 400,
    code: "DB_VALUE_TOO_LARGE",
    message: "Un valor excede la longitud permitida.",
  },
};

/** Códigos que significan "la base no está disponible", no "el cliente falló". */
const ORACLE_UNAVAILABLE = new Set([
  "01033",
  "03113",
  "03114",
  "12154",
  "12170",
  "12514",
  "12541",
]);

function fromOracle(error: unknown): NormalizedError | null {
  const match = /ORA-(\d{5})/.exec(chainText(error));
  if (!match) return null;

  const [, oracleCode] = match;

  const known = ORACLE_ERRORS[oracleCode];
  if (known) return { ...known, isOperational: true };

  if (ORACLE_UNAVAILABLE.has(oracleCode)) {
    return {
      statusCode: 503,
      code: "DB_UNAVAILABLE",
      message: "La base de datos no está disponible en este momento.",
      isOperational: true,
    };
  }

  // Cualquier otro ORA es un problema nuestro (esquema, permisos, SQL mal
  // formado): 500 y sin exponer el código al cliente.
  return {
    statusCode: 500,
    code: "DB_ERROR",
    message: "Error al acceder a la base de datos.",
    isOperational: false,
  };
}

function fromZod(error: ZodError): NormalizedError {
  return {
    statusCode: 400,
    code: "VALIDATION_ERROR",
    message: "Validation failed",
    errors: error.issues.map((issue) => ({
      field: issue.path.join(".") || "(body)",
      message: issue.message,
    })),
    isOperational: true,
  };
}

/** Errores que Express/body-parser marcan con `type` y `status`. */
function fromExpress(error: Error & { type?: string; status?: number }): NormalizedError | null {
  if (error.type === "entity.parse.failed") {
    return {
      statusCode: 400,
      code: "MALFORMED_JSON",
      message: "El cuerpo de la petición no es JSON válido.",
      isOperational: true,
    };
  }

  if (error.type === "entity.too.large") {
    return {
      statusCode: 413,
      code: "PAYLOAD_TOO_LARGE",
      message: "El cuerpo de la petición excede el tamaño permitido.",
      isOperational: true,
    };
  }

  return null;
}

function fromJwt(error: Error): NormalizedError | null {
  if (error.name === "TokenExpiredError") {
    return {
      statusCode: 401,
      code: "TOKEN_EXPIRED",
      message: "El token ha expirado.",
      isOperational: true,
    };
  }

  if (error.name === "JsonWebTokenError" || error.name === "NotBeforeError") {
    return {
      statusCode: 401,
      code: "INVALID_TOKEN",
      message: "El token no es válido.",
      isOperational: true,
    };
  }

  return null;
}

/** Código por defecto a partir del status, para que el cliente siempre tenga uno. */
function codeForStatus(statusCode: number): string {
  const byStatus: Record<number, string> = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    409: "CONFLICT",
    413: "PAYLOAD_TOO_LARGE",
    422: "UNPROCESSABLE_ENTITY",
    429: "TOO_MANY_REQUESTS",
    503: "SERVICE_UNAVAILABLE",
  };

  if (byStatus[statusCode]) return byStatus[statusCode];
  return statusCode >= 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR";
}

/**
 * Convierte cualquier cosa lanzada en la aplicación a una respuesta HTTP
 * coherente. El orden importa: lo más específico primero.
 */
export function normalizeError(error: unknown): NormalizedError {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      code: error.code ?? codeForStatus(error.statusCode),
      message: error.message,
      errors: error.errors,
      isOperational: error.isOperational,
    };
  }

  if (error instanceof ZodError) return fromZod(error);

  if (error instanceof Error) {
    const jwtError = fromJwt(error);
    if (jwtError) return jwtError;

    const expressError = fromExpress(error);
    if (expressError) return expressError;

    // Se busca en toda la cadena: el error del driver puede venir envuelto.
    const oracleError = fromOracle(error);
    if (oracleError) return oracleError;
  }

  return {
    statusCode: 500,
    code: "INTERNAL_ERROR",
    message: "Internal server error",
    isOperational: false,
  };
}
