// tests/unit/core/config/security.config.unit.test.ts
import type { IEnvs } from "../../../../src/domain/interfaces/infrastructure/plugins/envs.plugin.interface";
import { AppError } from "../../../../src/core/errors/app-error";
import {
  areDocsEnabled,
  buildAuthRateLimiter,
  buildCorsOptions,
  buildHelmetOptions,
  buildRateLimiter,
  resolveAllowedOrigins,
  resolveBodyLimit,
  resolveTrustProxy,
  SECURITY_DEFAULTS,
} from "../../../../src/core/config/security.config";

/** Entorno de mentira: lo que no esté declarado devuelve "", como DotenvPlugin. */
const envsOf = (values: Record<string, string> = {}): IEnvs => ({
  getEnv: (key: string) => values[key] ?? "",
});

/** Ejecuta la función `origin` de la política de CORS y resuelve su callback. */
const checkOrigin = (
  options: ReturnType<typeof buildCorsOptions>,
  origin: string | undefined
): Promise<{ error: Error | null; allowed?: boolean }> =>
  new Promise((resolve) => {
    const check = options.origin as (
      origin: string | undefined,
      callback: (error: Error | null, allowed?: boolean) => void
    ) => void;
    check(origin, (error, allowed) => resolve({ error, allowed }));
  });

describe("security.config", () => {
  describe("resolveBodyLimit", () => {
    it("cae a 1mb cuando no hay variable", () => {
      expect(resolveBodyLimit(envsOf())).toBe(SECURITY_DEFAULTS.bodyLimit);
    });

    it("respeta el valor configurado", () => {
      expect(resolveBodyLimit(envsOf({ BODY_LIMIT: "256kb" }))).toBe("256kb");
    });
  });

  describe("resolveTrustProxy", () => {
    it("no confía en ningún proxy por defecto", () => {
      expect(resolveTrustProxy(envsOf())).toBe(0);
    });

    it("acepta el cero explícito", () => {
      expect(resolveTrustProxy(envsOf({ TRUST_PROXY_HOPS: "0" }))).toBe(0);
    });

    it("lee el número de saltos", () => {
      expect(resolveTrustProxy(envsOf({ TRUST_PROXY_HOPS: "2" }))).toBe(2);
    });

    it("ignora un valor que no es un entero", () => {
      expect(resolveTrustProxy(envsOf({ TRUST_PROXY_HOPS: "true" }))).toBe(0);
    });
  });

  describe("resolveAllowedOrigins", () => {
    it("devuelve una lista vacía si no hay nada configurado", () => {
      expect(resolveAllowedOrigins(envsOf())).toEqual([]);
    });

    it("admite varios orígenes separados por comas", () => {
      const origins = resolveAllowedOrigins(
        envsOf({
          CORS_ORIGINS: "https://app.midominio.com,http://localhost:5173,http://localhost:3000",
        })
      );

      expect(origins).toEqual([
        "https://app.midominio.com",
        "http://localhost:5173",
        "http://localhost:3000",
      ]);
    });

    it("normaliza espacios, barra final y mayúsculas, y descarta duplicados", () => {
      const origins = resolveAllowedOrigins(
        envsOf({ CORS_ORIGINS: " https://App.com/ , https://app.com , , " })
      );

      expect(origins).toEqual(["https://app.com"]);
    });
  });

  describe("buildCorsOptions", () => {
    const options = () =>
      buildCorsOptions(
        envsOf({ CORS_ORIGINS: "https://app.midominio.com,http://localhost:5173" })
      );

    it("acepta cualquiera de los orígenes de la lista", async () => {
      expect(await checkOrigin(options(), "https://app.midominio.com")).toEqual({
        error: null,
        allowed: true,
      });
      expect(await checkOrigin(options(), "http://localhost:5173")).toEqual({
        error: null,
        allowed: true,
      });
    });

    it("acepta una petición sin cabecera Origin (curl, Postman, sondeos)", async () => {
      expect(await checkOrigin(options(), undefined)).toEqual({ error: null, allowed: true });
    });

    it("rechaza un origen ajeno con un AppError 403", async () => {
      const { error } = await checkOrigin(options(), "http://evil.test");

      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).statusCode).toBe(403);
      expect((error as AppError).code).toBe("CORS_ORIGIN_NOT_ALLOWED");
    });

    it("registra el origen bloqueado, que es lo que el navegador no dice", async () => {
      const logger = { warn: jest.fn() } as never;
      const withLogger = buildCorsOptions(envsOf({ CORS_ORIGINS: "https://app.com" }), logger);

      await checkOrigin(withLogger, "https://app.com.evil.test");

      expect((logger as unknown as { warn: jest.Mock }).warn).toHaveBeenCalledWith(
        "Origen bloqueado por CORS",
        expect.objectContaining({ origin: "https://app.com.evil.test" })
      );
    });

    it("con `*` en la lista acepta cualquier origen", async () => {
      const any = buildCorsOptions(envsOf({ CORS_ORIGINS: "*" }));

      expect(await checkOrigin(any, "http://cualquiera.test")).toEqual({
        error: null,
        allowed: true,
      });
    });

    it("sin lista sólo deja pasar lo que no trae Origin", async () => {
      const strict = buildCorsOptions(envsOf());

      expect(await checkOrigin(strict, undefined)).toEqual({ error: null, allowed: true });
      expect((await checkOrigin(strict, "https://app.com")).error).toBeInstanceOf(AppError);
    });

    it("expone la cabecera del id de petición para que el front pueda leerla", () => {
      expect(options().exposedHeaders).toContain("x-request-id");
    });
  });

  describe("buildRateLimiter", () => {
    it("se construye con los valores por defecto", () => {
      expect(buildRateLimiter(envsOf())).toBeInstanceOf(Function);
    });

    it("se desactiva con RATE_LIMIT_MAX=0", () => {
      expect(buildRateLimiter(envsOf({ RATE_LIMIT_MAX: "0" }))).toBeNull();
    });

    it("deja pasar los health checks sin gastar cupo", () => {
      const limiter = buildRateLimiter(envsOf({ RATE_LIMIT_MAX: "1" }))!;
      const next = jest.fn();
      const res = { setHeader: jest.fn() } as never;

      // Más llamadas que el cupo: si se contaran, la segunda respondería 429.
      for (const path of ["/health", "/health/ready", "/health/live"]) {
        limiter({ path } as never, res, next);
      }

      expect(next).toHaveBeenCalledTimes(3);
      expect(next).not.toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe("buildAuthRateLimiter", () => {
    it("se construye con los valores por defecto", () => {
      expect(buildAuthRateLimiter(envsOf())).toBeInstanceOf(Function);
    });

    it("se desactiva con AUTH_RATE_LIMIT_MAX=0", () => {
      expect(buildAuthRateLimiter(envsOf({ AUTH_RATE_LIMIT_MAX: "0" }))).toBeNull();
    });
  });

  describe("buildHelmetOptions", () => {
    it("trae la CSP apagada por defecto", () => {
      expect(buildHelmetOptions(envsOf()).contentSecurityPolicy).toBe(false);
    });

    it("la enciende con CSP_ENABLED=true", () => {
      const csp = buildHelmetOptions(envsOf({ CSP_ENABLED: "true" })).contentSecurityPolicy;

      expect(csp).toMatchObject({
        directives: expect.objectContaining({ "default-src": ["'self'"] }),
      });
    });
  });

  describe("areDocsEnabled", () => {
    it("publica la documentación fuera de producción", () => {
      expect(areDocsEnabled(envsOf({ NODE_ENV: "development" }))).toBe(true);
      expect(areDocsEnabled(envsOf())).toBe(true);
    });

    it("la oculta en producción", () => {
      expect(areDocsEnabled(envsOf({ NODE_ENV: "production" }))).toBe(false);
    });

    it("DOCS_ENABLED manda en los dos sentidos", () => {
      expect(areDocsEnabled(envsOf({ NODE_ENV: "production", DOCS_ENABLED: "true" }))).toBe(true);
      expect(areDocsEnabled(envsOf({ NODE_ENV: "development", DOCS_ENABLED: "false" }))).toBe(
        false
      );
    });
  });
});
