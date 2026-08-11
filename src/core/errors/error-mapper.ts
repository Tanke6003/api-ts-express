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

// ===========================================================  motores  ======
//
// Un fallo que provoca el cliente —un duplicado, una referencia que no existe—
// tiene que responderse igual venga del motor que venga: si en Oracle es un 409
// y en PostgreSQL un 500, la promesa de que el módulo se comporta igual sobre
// cualquier motor se rompe justo donde más se nota.
//
// Por eso el mapeo no es "un caso por código de driver" sino seis resultados
// comunes, y cada motor traduce los suyos a ellos.

interface DriverFailure {
  statusCode: number;
  code: string;
  message: string;
}

const UNIQUE: DriverFailure = {
  statusCode: 409,
  code: "DB_UNIQUE_VIOLATION",
  message: "Ya existe un registro con esos datos.",
};
const NOT_NULL: DriverFailure = {
  statusCode: 400,
  code: "DB_NOT_NULL_VIOLATION",
  message: "Falta un campo obligatorio.",
};
const CHECK: DriverFailure = {
  statusCode: 400,
  code: "DB_CHECK_VIOLATION",
  message: "Los datos no cumplen una restricción de la tabla.",
};
const REFERENCE_NOT_FOUND: DriverFailure = {
  statusCode: 400,
  code: "DB_REFERENCE_NOT_FOUND",
  message: "La referencia indicada no existe.",
};
const REFERENCE_IN_USE: DriverFailure = {
  statusCode: 409,
  code: "DB_REFERENCE_IN_USE",
  message: "No se puede eliminar: hay registros que dependen de este.",
};
const VALUE_TOO_LARGE: DriverFailure = {
  statusCode: 400,
  code: "DB_VALUE_TOO_LARGE",
  message: "Un valor excede la longitud permitida.",
};

const UNAVAILABLE: DriverFailure = {
  statusCode: 503,
  code: "DB_UNAVAILABLE",
  message: "La base de datos no está disponible en este momento.",
};

/** Lo que no es culpa de quien llama: esquema, permisos, SQL mal formado. */
const OUR_FAULT: NormalizedError = {
  statusCode: 500,
  code: "DB_ERROR",
  message: "Error al acceder a la base de datos.",
  isOperational: false,
};

/** Oracle, por número de ORA. */
const ORACLE_ERRORS: Record<string, DriverFailure> = {
  "00001": UNIQUE,
  "01400": NOT_NULL,
  "02290": CHECK,
  "02291": REFERENCE_NOT_FOUND,
  "02292": REFERENCE_IN_USE,
  "12899": VALUE_TOO_LARGE,
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

/** PostgreSQL, por SQLSTATE. */
const POSTGRES_ERRORS: Record<string, DriverFailure> = {
  "23505": UNIQUE,
  "23502": NOT_NULL,
  "23514": CHECK,
  "22001": VALUE_TOO_LARGE,
  "57P03": UNAVAILABLE,
  "08000": UNAVAILABLE,
  "08001": UNAVAILABLE,
  "08003": UNAVAILABLE,
  "08004": UNAVAILABLE,
  "08006": UNAVAILABLE,
};

/** MySQL / MariaDB, por `errno`. A diferencia de PostgreSQL sí distingue el
 *  sentido de la violación de clave ajena, igual que Oracle. */
const MYSQL_ERRORS: Record<number, DriverFailure> = {
  1062: UNIQUE,
  1169: UNIQUE,
  1048: NOT_NULL,
  1364: NOT_NULL,
  3819: CHECK,
  1452: REFERENCE_NOT_FOUND,
  1451: REFERENCE_IN_USE,
  1406: VALUE_TOO_LARGE,
  1042: UNAVAILABLE,
  1043: UNAVAILABLE,
};

/** SQL Server, por número de error de T-SQL. */
const SQLSERVER_ERRORS: Record<number, DriverFailure> = {
  2627: UNIQUE,
  2601: UNIQUE,
  515: NOT_NULL,
  547: CHECK, // se afina abajo: 547 cubre CHECK y ambos sentidos de la FK
  8152: VALUE_TOO_LARGE,
  2628: VALUE_TOO_LARGE,
  4060: UNAVAILABLE,
  40613: UNAVAILABLE,
};

/** MongoDB, por código de servidor. */
const MONGO_ERRORS: Record<number, DriverFailure> = {
  11000: UNIQUE,
  11001: UNIQUE,
  121: CHECK, // el validador $jsonSchema rechazó el documento
};

/**
 * PostgreSQL y SQL Server usan un mismo código para las dos direcciones de una
 * clave ajena, mientras que Oracle y MySQL las distinguen. Insertar apuntando a
 * un padre que no existe es un 400 —lo que mandó el cliente es inválido— y
 * borrar un padre que aún tiene hijos es un 409. Sin este matiz el mismo caso
 * respondería distinto según el motor, que es justo lo que se quiere evitar.
 */
function referenceDirection(text: string): DriverFailure {
  return /still referenced|DELETE statement conflicted|REFERENCE constraint/i.test(text)
    ? REFERENCE_IN_USE
    : REFERENCE_NOT_FOUND;
}

/** Errores de conexión de Sequelize y del driver de Mongo, por nombre de clase. */
const UNAVAILABLE_NAMES =
  /^(SequelizeConnection|SequelizeHostNotFound|SequelizeAccessDenied|MongoNetwork|MongoServerSelection|MongoNotConnected)/;

/** Códigos de sistema: el proceso ni siquiera llegó a hablar con la base. */
const UNAVAILABLE_SYSTEM = new Set(["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "EHOSTUNREACH"]);

interface DriverErrorShape {
  name?: string;
  code?: unknown;
  errno?: unknown;
  number?: unknown;
}

/**
 * Identifica un eslabón de la cadena por lo que trae, no por el motor
 * configurado: cada driver deja una huella distinta y reconocible.
 */
function fromDriverLink(link: unknown): NormalizedError | null {
  if (!(link instanceof Error)) return null;

  const { name, code, errno, number: tsqlNumber } = link as unknown as DriverErrorShape;
  const text = link.message ?? "";

  if (name && UNAVAILABLE_NAMES.test(name)) return { ...UNAVAILABLE, isOperational: true };
  if (typeof code === "string" && UNAVAILABLE_SYSTEM.has(code)) {
    return { ...UNAVAILABLE, isOperational: true };
  }

  // Oracle: el código viaja en `code` ("ORA-00001") y también en el mensaje.
  const oracle = /ORA-(\d{5})/.exec(typeof code === "string" ? code : "") ?? /ORA-(\d{5})/.exec(text);
  if (oracle) {
    const known = ORACLE_ERRORS[oracle[1]];
    if (known) return { ...known, isOperational: true };
    if (ORACLE_UNAVAILABLE.has(oracle[1])) return { ...UNAVAILABLE, isOperational: true };
    return OUR_FAULT;
  }

  // SQL Server (tedious): `code` genérico y el número real en `number`.
  if (code === "EREQUEST" && typeof tsqlNumber === "number") {
    const known = SQLSERVER_ERRORS[tsqlNumber];
    if (!known) return OUR_FAULT;
    return { ...(tsqlNumber === 547 ? referenceDirection(text) : known), isOperational: true };
  }

  // MySQL / MariaDB (mysql2): `errno` numérico y un `code` que empieza por ER_.
  if (typeof errno === "number" && typeof code === "string" && code.startsWith("ER_")) {
    const known = MYSQL_ERRORS[errno];
    return known ? { ...known, isOperational: true } : OUR_FAULT;
  }

  // PostgreSQL (pg): `code` es el SQLSTATE de cinco caracteres.
  if (typeof code === "string" && /^\d{2}[0-9A-Z]{3}$/.test(code)) {
    if (code === "23503") return { ...referenceDirection(text), isOperational: true };
    const known = POSTGRES_ERRORS[code];
    return known ? { ...known, isOperational: true } : OUR_FAULT;
  }

  // MongoDB: el driver usa códigos numéricos y nombres propios.
  if (typeof name === "string" && name.startsWith("Mongo") && typeof code === "number") {
    const known = MONGO_ERRORS[code];
    return known ? { ...known, isOperational: true } : OUR_FAULT;
  }

  return null;
}

/**
 * Sequelize envuelve el error del driver y lo deja en `parent` y `original`, no
 * en `cause`, así que la cadena de causas no basta para llegar hasta él.
 */
function driverChain(error: unknown): unknown[] {
  const vistos = new Set<unknown>();
  const pendientes = [...causeChain(error)];
  const cadena: unknown[] = [];

  while (pendientes.length > 0) {
    const actual = pendientes.shift();
    if (actual === undefined || actual === null || vistos.has(actual)) continue;
    vistos.add(actual);
    cadena.push(actual);

    if (actual instanceof Error) {
      const bruto = actual as unknown as Record<string, unknown>;
      pendientes.push(bruto.cause, bruto.parent, bruto.original);
    }
  }

  return cadena;
}

/**
 * Recorre la cadena entera y devuelve el primer eslabón que se reconoce. Se
 * empieza por fuera, pero el que manda es el más específico: el envoltorio de
 * Sequelize sólo dice "hay un error de conexión" o nada, y el del driver dice
 * exactamente cuál.
 */
function fromDriver(error: unknown): NormalizedError | null {
  let generico: NormalizedError | null = null;

  for (const link of driverChain(error)) {
    const identificado = fromDriverLink(link);
    if (!identificado) continue;
    if (identificado.code === "DB_ERROR") {
      generico ??= identificado;
      continue;
    }
    return identificado;
  }

  return generico;
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

    // Se busca en toda la cadena: el error del driver viene envuelto por el
    // repositorio y, en los motores que pasan por Sequelize, también por él.
    const driverError = fromDriver(error);
    if (driverError) return driverError;
  }

  return {
    statusCode: 500,
    code: "INTERNAL_ERROR",
    message: "Internal server error",
    isOperational: false,
  };
}
