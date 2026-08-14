// src/core/config/security.config.ts
//
// Endurecimiento de la capa HTTP, en un solo sitio y guiado por variables de
// entorno: cabeceras (helmet), límite de peticiones, CORS por lista blanca,
// tamaño máximo del cuerpo y si la documentación se publica.
//
// Vive aquí y no en `server.ts` porque son decisiones de configuración, no de
// cableado: el servidor sólo monta lo que este módulo decide, y una política se
// puede probar sin levantar Express entero.
import type { CorsOptions } from "cors";
import rateLimit, { type RateLimitRequestHandler } from "express-rate-limit";
import type { HelmetOptions } from "helmet";
import type { IEnvs } from "../../domain/interfaces/infrastructure/plugins/envs.plugin.interface";
import type { ILogger } from "../../domain/interfaces/infrastructure/plugins/logger.plugin.interface";
import { REQUEST_ID_HEADER } from "../../presentation/middlewares/requestContext.middleware";
import { AppError } from "../errors/app-error";

/**
 * Valores por defecto. Están pensados para que la plantilla arranque segura sin
 * ninguna variable definida: quien despliega sube lo que necesite, no baja lo
 * que se le olvidó.
 */
export const SECURITY_DEFAULTS = {
  /**
   * 1 MB es el propio valor por defecto de Express y sobra: el cuerpo más
   * grande que acepta esta API es una cita, y sus validadores la dejan muy por
   * debajo de 1 KB. Las subidas no pasan por aquí —busboy consume el stream
   * crudo—, así que un límite alto sólo permitiría que un cliente hiciera al
   * parser acumular megabytes en memoria antes de rechazar nada.
   */
  bodyLimit: "1mb",
  /** Ventana y cupo del limitador general. */
  windowMs: 60_000,
  limit: 120,
  /** Ventana y cupo de las rutas que emiten credenciales. Mucho más estrecho. */
  authWindowMs: 15 * 60_000,
  authLimit: 10,
} as const;

/**
 * Entero de configuración con su mínimo aceptable. Mismo criterio que
 * `repository.factory.ts`: un valor vacío o fuera de rango cae al valor por
 * defecto en vez de propagar un NaN.
 */
function toInt(raw: string, fallback: number, min = 1): number {
  // `Number("")` es 0, así que sin este corte una variable sin definir se leería
  // como un cero puesto a propósito.
  if (raw.trim() === "") return fallback;

  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= min ? parsed : fallback;
}

/** Lee una variable de tres estados: `true`, `false` o "lo que decida quien llama". */
function readFlag(envs: IEnvs, key: string): boolean | undefined {
  const value = envs.getEnv(key).trim().toLowerCase();
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function isProduction(envs: IEnvs): boolean {
  return (envs.getEnv("NODE_ENV") || "development").toLowerCase() === "production";
}

// ---------------------------------------------------------------- cuerpo ----

export function resolveBodyLimit(envs: IEnvs): string {
  return envs.getEnv("BODY_LIMIT").trim() || SECURITY_DEFAULTS.bodyLimit;
}

// ----------------------------------------------------------------- proxy ----

/**
 * Cuántos proxys de confianza hay por delante (0 = ninguno, 1 = un nginx o un
 * balanceador).
 *
 * Es un número y nunca `true` a propósito: con `true` Express se cree cualquier
 * `X-Forwarded-For`, y entonces el limitador cuenta por una IP que el propio
 * cliente elige, con lo que basta variarla para saltárselo. Con un número, sólo
 * se leen tantos saltos como haya de verdad.
 */
export function resolveTrustProxy(envs: IEnvs): number {
  return toInt(envs.getEnv("TRUST_PROXY_HOPS"), 0, 0);
}

// ------------------------------------------------------------------ CORS ----

/** Quita la barra final y normaliza la caja: `https://App.com/` y `https://app.com` son el mismo origen. */
function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/+$/, "").toLowerCase();
}

/**
 * Lista blanca de orígenes, leída de `CORS_ORIGINS` como valores separados por
 * comas. Devuelve un arreglo, así que admite tantos como haga falta: el dominio
 * de producción y, a la vez, el `localhost` desde el que se depura el front
 * contra ese mismo servidor.
 *
 * `*` es un comodín explícito: si aparece en la lista se acepta cualquier
 * origen. Útil en desarrollo; en producción es justo lo que no se quiere.
 */
export function resolveAllowedOrigins(envs: IEnvs): string[] {
  const configured = envs
    .getEnv("CORS_ORIGINS")
    .split(",")
    .map(normalizeOrigin)
    .filter((origin) => origin.length > 0);

  return [...new Set(configured)];
}

/**
 * Política de CORS.
 *
 * Una petición sin cabecera `Origin` se acepta siempre: no es una petición de
 * navegador entre orígenes sino curl, Postman, Swagger local o el sondeo del
 * balanceador. CORS no protege de esas, y rechazarlas sólo rompería las
 * herramientas.
 *
 * El rechazo se delega en el manejador global —igual que hace el guard de JWT—
 * para que un origen no permitido responda con el mismo formato de error que el
 * resto de la API, con su código y su id de petición.
 */
export function buildCorsOptions(envs: IEnvs, logger?: ILogger): CorsOptions {
  const allowed = resolveAllowedOrigins(envs);
  const allowAny = allowed.includes("*");

  return {
    origin(origin, callback) {
      if (!origin || allowAny || allowed.includes(normalizeOrigin(origin))) {
        callback(null, true);
        return;
      }

      // Se registra porque el síntoma en el navegador —"blocked by CORS"— no
      // dice qué origen llegó, y casi siempre es una barra final o un puerto.
      logger?.warn("Origen bloqueado por CORS", { origin, allowed });
      callback(
        new AppError(`Origen no permitido: ${origin}`, 403, true, {
          code: "CORS_ORIGIN_NOT_ALLOWED",
        })
      );
    },
    credentials: true,
    // Para que el front pueda leer el id de la petición y enseñarlo en un
    // error: sin exponerla, el navegador oculta la cabecera al JavaScript.
    exposedHeaders: [REQUEST_ID_HEADER],
  };
}

// ------------------------------------------------------------ rate limit ----

interface LimiterSpec {
  windowKey: string;
  limitKey: string;
  windowFallback: number;
  limitFallback: number;
  message: string;
}

/**
 * Construye un limitador, o `null` si su cupo está puesto a 0 (desactivado).
 *
 * El rechazo también va por `next(AppError)`: así un 429 sale con `code`,
 * `requestId` y `timestamp` como cualquier otro error. `codeForStatus` ya
 * contempla el 429, y las cabeceras `RateLimit-*` las pone la librería.
 */
function buildLimiter(envs: IEnvs, spec: LimiterSpec): RateLimitRequestHandler | null {
  const limit = toInt(envs.getEnv(spec.limitKey), spec.limitFallback, 0);
  if (limit === 0) return null;

  return rateLimit({
    windowMs: toInt(envs.getEnv(spec.windowKey), spec.windowFallback, 1000),
    limit,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new AppError(spec.message, 429, true, { code: "RATE_LIMITED" }));
    },
  });
}

/**
 * Limitador general, por IP. Deja fuera los health checks: un balanceador
 * sondea cada pocos segundos y agotaría el cupo de su propia IP, con lo que la
 * instancia acabaría marcada como caída por estar sana.
 */
export function buildRateLimiter(envs: IEnvs): RateLimitRequestHandler | null {
  const limiter = buildLimiter(envs, {
    windowKey: "RATE_LIMIT_WINDOW_MS",
    limitKey: "RATE_LIMIT_MAX",
    windowFallback: SECURITY_DEFAULTS.windowMs,
    limitFallback: SECURITY_DEFAULTS.limit,
    message: "Demasiadas peticiones. Inténtalo de nuevo en un momento.",
  });

  if (!limiter) return null;

  return ((req, res, next) => {
    if (req.path === "/health" || req.path.startsWith("/health/")) {
      next();
      return;
    }
    limiter(req, res, next);
  }) as RateLimitRequestHandler;
}

/**
 * Limitador de las rutas que entregan credenciales. Mucho más estrecho que el
 * general: un token es lo único que abre el resto de la API, así que es lo
 * primero que alguien intentará pedir en bucle.
 */
export function buildAuthRateLimiter(envs: IEnvs): RateLimitRequestHandler | null {
  return buildLimiter(envs, {
    windowKey: "AUTH_RATE_LIMIT_WINDOW_MS",
    limitKey: "AUTH_RATE_LIMIT_MAX",
    windowFallback: SECURITY_DEFAULTS.authWindowMs,
    limitFallback: SECURITY_DEFAULTS.authLimit,
    message: "Demasiados intentos. Inténtalo de nuevo más tarde.",
  });
}

// ---------------------------------------------------------------- helmet ----

/**
 * Directivas pensadas para la interfaz de ejemplo de `public/`: Tailwind por
 * CDN, que además compila las clases en el navegador (de ahí `unsafe-eval`) e
 * inyecta un `<style>` (de ahí `unsafe-inline`), y el favicon en un `data:`.
 *
 * Si sustituyes esa interfaz por la tuya, esta política es lo primero que hay
 * que reescribir, y casi siempre para quitar cosas.
 */
const DEMO_UI_CSP: Record<string, string[]> = {
  "default-src": ["'self'"],
  "script-src": ["'self'", "https://cdn.tailwindcss.com", "'unsafe-eval'"],
  "style-src": ["'self'", "'unsafe-inline'"],
  "img-src": ["'self'", "data:"],
  "connect-src": ["'self'"],
  "font-src": ["'self'", "data:"],
  "object-src": ["'none'"],
  "frame-ancestors": ["'self'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"],
};

/**
 * La CSP viene **apagada** salvo que se pida con `CSP_ENABLED=true`.
 *
 * No es dejadez: la CSP por defecto de helmet rompe a la vez la interfaz de
 * ejemplo (Tailwind por CDN), Swagger UI (estilos en línea) y Scalar (carga sus
 * recursos de un CDN externo). Encenderla por defecto dejaría la plantilla
 * recién clonada con tres pantallas en blanco, que es la mejor forma de que el
 * siguiente la desactive entera en vez de ajustarla.
 *
 * En un despliegue real, con la documentación apagada y tu propio front, el
 * orden correcto es `CSP_ENABLED=true` y afinar `DEMO_UI_CSP`.
 *
 * Las otras doce cabeceras de helmet —nosniff, frameguard, HSTS,
 * referrer-policy…— se aplican siempre, con CSP o sin ella.
 */
export function buildHelmetOptions(envs: IEnvs): HelmetOptions {
  const enabled = readFlag(envs, "CSP_ENABLED") ?? false;

  return {
    contentSecurityPolicy: enabled ? { directives: DEMO_UI_CSP } : false,
  };
}

// --------------------------------------------------------- documentación ----

/**
 * Si se publican Swagger, Scalar y el `openapi.json`. Por defecto sólo fuera de
 * producción; `DOCS_ENABLED` fuerza el valor en cualquier sentido.
 *
 * Nota para cuando se quiera activar en producción: hoy el spec saldría vacío.
 * `swagger.config.ts` busca las anotaciones en `./src/**\/*.ts`, que no existe
 * en el contenedor de producción, y `tsconfig.json` compila con
 * `removeComments: true`, que borra los bloques `@openapi` del `dist`. Habría
 * que generar el spec en el build y servirlo como JSON estático.
 */
export function areDocsEnabled(envs: IEnvs): boolean {
  return readFlag(envs, "DOCS_ENABLED") ?? !isProduction(envs);
}
