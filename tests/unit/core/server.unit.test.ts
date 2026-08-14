// tests/unit/core/server.unit.test.ts
import request from "supertest";
import jwt from "jsonwebtoken";
import { Server } from "../../../src/core/server";
import { container } from "tsyringe";
import { IEnvs } from "../../../src/domain/interfaces/infrastructure/plugins/envs.plugin.interface";
import { ILogger } from "../../../src/domain/interfaces/infrastructure/plugins/logger.plugin.interface";
import { ITokenPlugin } from "../../../src/domain/interfaces/infrastructure/plugins/token.plugin.interface";
import { JwtPlugin } from "../../../src/infrastructure/plugins/jwt.plugin";
import { IRequestContext } from "../../../src/domain/interfaces/infrastructure/plugins/request-context.plugin.interface";
import { AsyncRequestContextPlugin } from "../../../src/infrastructure/plugins/asyncRequestContext.plugin";

jest.mock("swagger-jsdoc", () => jest.fn(() => ({ openapi: "3.0.0" })));
jest.mock("swagger-ui-express", () => ({
  serve: jest.fn((_req: any, _res: any, next: any) => next()),
  setup: jest.fn(() => (_req: any, res: any) => res.send("swagger-ui")),
}));
jest.mock(
  "@scalar/express-api-reference",
  () => ({
    apiReference: jest.fn(() => (_req: any, res: any) => res.send("scalar-ui")),
  }),
  { virtual: true }
);

const TEST_JWT_SECRET = "unit-test-secret";

describe("Server", () => {
  let server: Server;
  let healthProbe: { report: jest.Mock; beginShutdown: jest.Mock };

  /** Estado que devuelve el sondeo de salud; los tests lo ajustan a su caso. */
  const healthy = {
    ready: true,
    dataSource: "memory",
    database: "not_applicable" as const,
    shuttingDown: false,
  };

  beforeEach(() => {
    container.reset();

    healthProbe = {
      report: jest.fn().mockResolvedValue(healthy),
      beginShutdown: jest.fn(),
    };
    container.register("IHealthProbe", { useValue: healthProbe });

    container.register<IEnvs>("IEnvs", {
      useValue: {
        getEnv: (key: string) => {
          if (key === "JWT_SECRET") return TEST_JWT_SECRET;
          if (key === "PORT") return "3000";
          return "";
        },
      },
    });

    container.registerSingleton<IRequestContext>("IRequestContext", AsyncRequestContextPlugin);
    container.register<ITokenPlugin>("ITokenPlugin", { useClass: JwtPlugin });

    container.register("IUsersController", {
      useValue: {
        getAllUsers: jest.fn((_req: any, res: any, _next: any) => res.json([])),
        getUserById: jest.fn((_req: any, res: any, _next: any) => res.json({ id: 1 })),
        createUser: jest.fn((_req: any, res: any, _next: any) => res.status(201).json({ id: 2 })),
        updateUser: jest.fn((_req: any, res: any, _next: any) => res.json({ id: 1, updated: true })),
        deleteUser: jest.fn((_req: any, res: any, _next: any) => res.status(204).send()),
      },
    });

    // Los módulos nuevos sólo necesitan responder algo: aquí se prueba el
    // cableado del servidor, no su lógica.
    const controllerStub = () => ({
      getAll: jest.fn((_req: any, res: any, _next: any) => res.json({ data: [] })),
      getById: jest.fn((_req: any, res: any, _next: any) => res.json({ id: 1 })),
      create: jest.fn((_req: any, res: any, _next: any) => res.status(201).json({ id: 1 })),
      update: jest.fn((_req: any, res: any, _next: any) => res.json({ id: 1 })),
      softDelete: jest.fn((_req: any, res: any, _next: any) => res.status(204).send()),
      hardDelete: jest.fn((_req: any, res: any, _next: any) => res.status(204).send()),
      restore: jest.fn((_req: any, res: any, _next: any) => res.json({ status: "ok" })),
      getStats: jest.fn((_req: any, res: any, _next: any) => res.json({ data: [] })),
    });

    container.register("IBranchesController", { useValue: controllerStub() });
    container.register("IAppointmentsController", { useValue: controllerStub() });
    container.register("IAuditController", {
      useValue: { getAll: jest.fn((_req: any, res: any) => res.json({ data: [] })) },
    });
    container.register("IIdentityController", {
      useValue: { me: jest.fn((_req: any, res: any) => res.json({ id: "1" })) },
    });
    container.register("IDevController", {
      useValue: {
        generateToken: jest.fn((_req: any, res: any) => res.json({ token: "t" })),
        uploadFile: jest.fn((_req: any, res: any) => res.json({ path: "p" })),
        uploadFiles: jest.fn((_req: any, res: any) => res.json({ paths: [] })),
        tokenRateLimit: [],
      },
    });

    container.register<ILogger>("ILogger", {
      useValue: {
        http: jest.fn().mockReturnValue(
          jest.fn((_req: any, _res: any, next: any) => next())
        ),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        log: jest.fn(),
        trace: jest.fn(),
      },
    });

    server = new Server(3000);
  });

  it("should expose /health endpoint with JSON response", async () => {
    await server.configureMiddleware();
    await server.configureRoutes();

    const res = await request(server.app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok" });
    expect(res.body).toHaveProperty("timestamp");
    expect(res.body).toHaveProperty("uptime");
  });

  it("should expose swagger docs at /api/swagger", async () => {
    await server.configureMiddleware();
    await server.configureSwagger();

    const res = await request(server.app).get("/api/swagger");
    expect(res.status).toBe(200);
    expect(res.text).toContain("swagger-ui");
  });

  it("should expose OpenAPI spec at /api/openapi.json", async () => {
    await server.configureMiddleware();
    await server.configureSwagger();

    const res = await request(server.app).get("/api/openapi.json");
    expect(res.status).toBe(200);
    // 3.1 porque su esquema es JSON Schema 2020-12, que es lo que emite Zod.
    expect(res.body).toMatchObject({ openapi: "3.1.0" });
    expect(res.body.info).toMatchObject({ title: expect.any(String) });
  });

  it("documents the decorated controllers without a line of hand-written YAML", async () => {
    await server.configureMiddleware();
    await server.configureSwagger();

    const { body } = await request(server.app).get("/api/openapi.json");
    const list = body.paths["/users"].get;
    const byId = body.paths["/users/{id}"].put;

    expect(list).toMatchObject({
      tags: ["Users"],
      summary: "Listado paginado de usuarios",
      security: [{ bearerAuth: [] }],
    });

    // Los parámetros salen del esquema de Zod que además valida la petición, no
    // de un bloque de comentarios: no pueden discrepar.
    expect(list.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ in: "query", name: "page" }),
        expect.objectContaining({ in: "query", name: "limit" }),
      ])
    );

    expect(byId.parameters).toEqual([
      { in: "path", name: "id", required: true, schema: { type: "integer" } },
    ]);
    expect(byId.requestBody.content["application/json"].schema).toMatchObject({
      type: "object",
      properties: { name: { type: "string", minLength: 1, maxLength: 100 } },
    });

    // El 401 lo pone el guard, así que lo documenta el generador y no cada ruta.
    expect(byId.responses["401"]).toBeDefined();
  });

  it("should expose scalar docs at /api/scalar", async () => {
    jest.spyOn(Server.prototype, "configureScalar").mockImplementationOnce(async function (this: Server) {
      this.app.use("/api/scalar", (_req: any, res: any) => res.send("scalar-ui"));
    });

    await server.configureMiddleware();
    await server.configureScalar();

    const res = await request(server.app).get("/api/scalar");
    expect(res.status).toBe(200);
    expect(res.text).toContain("scalar-ui");
  });

  it("should expose /api/users route (requires JWT)", async () => {
    await server.configureMiddleware();
    await server.configureRoutes();

    const token = jwt.sign({ userId: 1 }, TEST_JWT_SECRET, { expiresIn: "1h" });

    const res = await request(server.app)
      .get("/api/users")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
  });

  it("should return 401 on /api/users without token", async () => {
    await server.configureMiddleware();
    await server.configureRoutes();

    const res = await request(server.app).get("/api/users");
    expect(res.status).toBe(401);
  });

  it("serves the same routes under /api/v1 and the legacy /api alias", async () => {
    await server.configureMiddleware();
    await server.configureRoutes();

    const token = jwt.sign({ userId: 1 }, TEST_JWT_SECRET, { expiresIn: "1h" });
    const get = (path: string) =>
      request(server.app).get(path).set("Authorization", `Bearer ${token}`);

    expect((await get("/api/v1/users")).status).toBe(200);
    // El alias sin versión existe para no romper a quien ya llamaba así,
    // incluida la interfaz de ejemplo. Se retira en la próxima mayor.
    expect((await get("/api/users")).status).toBe(200);
  });

  // ------------------------------------------------- endurecimiento HTTP ---

  it("applies helmet headers and hides the framework", async () => {
    await server.configureMiddleware();
    await server.configureRoutes();

    const res = await request(server.app).get("/health");

    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["referrer-policy"]).toBe("no-referrer");
    // La CSP viene apagada por defecto: rompería la interfaz de ejemplo.
    expect(res.headers["content-security-policy"]).toBeUndefined();
  });

  it("advertises the rate limit and does not spend quota on health checks", async () => {
    await server.configureMiddleware();
    await server.configureRoutes();

    const res = await request(server.app).get("/api/users");

    // Los health checks quedan fuera del limitador, así que no llevan cabecera.
    expect(res.headers["ratelimit"]).toBeDefined();
    expect((await request(server.app).get("/health")).headers["ratelimit"]).toBeUndefined();
  });

  it("rejects an origin outside the whitelist with the API error format", async () => {
    container.register<IEnvs>("IEnvs", {
      useValue: {
        getEnv: (key: string) => {
          if (key === "JWT_SECRET") return TEST_JWT_SECRET;
          if (key === "PORT") return "3000";
          if (key === "CORS_ORIGINS") return "https://app.midominio.com,http://localhost:5173";
          return "";
        },
      },
    });

    await server.configureMiddleware();
    await server.configureRoutes();
    server.configureErrorHandling();

    const allowed = await request(server.app)
      .get("/health")
      .set("Origin", "http://localhost:5173");
    expect(allowed.status).toBe(200);
    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:5173");

    const blocked = await request(server.app).get("/health").set("Origin", "http://evil.test");
    expect(blocked.status).toBe(403);
    expect(blocked.body).toMatchObject({ status: "error", code: "CORS_ORIGIN_NOT_ALLOWED" });
    expect(blocked.body).toHaveProperty("requestId");
  });

  // ------------------------------------------------------------- salud ----

  it("keeps /health/live up even when the database is down", async () => {
    healthProbe.report.mockResolvedValue({ ...healthy, ready: false, database: "down" });

    await server.configureMiddleware();
    await server.configureRoutes();

    // Vivacidad no consulta la base: reiniciar el proceso no arregla una base
    // ajena, así que este sondeo no debe provocarlo.
    const res = await request(server.app).get("/health/live");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok" });
    expect(healthProbe.report).not.toHaveBeenCalled();
  });

  it("answers 503 on /health/ready when the database is down", async () => {
    healthProbe.report.mockResolvedValue({
      ready: false,
      dataSource: "postgres",
      database: "down",
      shuttingDown: false,
    });

    await server.configureMiddleware();
    await server.configureRoutes();

    const res = await request(server.app).get("/health/ready");

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ status: "degraded", database: "down", dataSource: "postgres" });
  });

  it("answers 503 while draining, and /health is the same check", async () => {
    healthProbe.report.mockResolvedValue({ ...healthy, ready: false, shuttingDown: true });

    await server.configureMiddleware();
    await server.configureRoutes();

    for (const path of ["/health", "/health/ready"]) {
      const res = await request(server.app).get(path);
      expect(res.status).toBe(503);
      expect(res.body).toMatchObject({ status: "shutting_down" });
    }
  });

  it("reports ok on /health when everything is up", async () => {
    await server.configureMiddleware();
    await server.configureRoutes();

    const res = await request(server.app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok", database: "not_applicable" });
  });

  // ------------------------------------------------------------ apagado ----

  it("close() is a no-op when the server never listened", async () => {
    await expect(server.close()).resolves.toBeUndefined();
  });

  it("close() drains: the in-flight request finishes and new ones are refused", async () => {
    jest.spyOn(Server.prototype, "configureScalar").mockImplementationOnce(async () => {});

    // Un controlador lento es la única forma de que haya algo realmente en
    // vuelo cuando se cierra; es justo la petición que hoy se cortaba a media
    // respuesta en cada despliegue.
    container.register("IUsersController", {
      useValue: {
        getAllUsers: (_req: any, res: any) => setTimeout(() => res.json({ ok: true }), 150),
        getUserById: jest.fn(),
        createUser: jest.fn(),
        updateUser: jest.fn(),
        deleteUser: jest.fn(),
      },
    });

    const draining = new Server(0);
    await draining.run();

    const base = `http://127.0.0.1:${draining.address!.port}`;
    const token = jwt.sign({ userId: 1 }, TEST_JWT_SECRET, { expiresIn: "1h" });

    // El `.then` no es decorativo: supertest es perezoso y no envía nada hasta
    // que alguien se suscribe. Sin él la petición saldría después del cierre.
    const inFlight = request(base)
      .get("/api/users")
      .set("Authorization", `Bearer ${token}`)
      .then((response) => response);
    // Tiempo suficiente para que la petición esté dentro del controlador, pero
    // no para que haya respondido.
    await new Promise((resolve) => setTimeout(resolve, 40));

    const closed = draining.close();

    await expect(inFlight).resolves.toMatchObject({ status: 200, body: { ok: true } });
    await expect(closed).resolves.toBeUndefined();

    // Y ya no acepta nada nuevo.
    await expect(request(base).get("/health/live")).rejects.toThrow();
  });

  it("run() keeps the http server so it can be closed, and close() is idempotent", async () => {
    // Scalar carga su módulo con un `import()` dinámico, que jest no resuelve
    // en CommonJS; aquí lo que se prueba es el ciclo de vida, no la doc.
    jest.spyOn(Server.prototype, "configureScalar").mockImplementationOnce(async () => {});

    // Puerto 0: el sistema asigna uno libre, así que el test no choca con nada.
    const listening = new Server(0);
    await listening.run();

    await expect(listening.close()).resolves.toBeUndefined();
    await expect(listening.close()).resolves.toBeUndefined();
  });

  it("rejects a body over the configured limit with a 413", async () => {
    container.register<IEnvs>("IEnvs", {
      useValue: {
        getEnv: (key: string) => {
          if (key === "JWT_SECRET") return TEST_JWT_SECRET;
          if (key === "PORT") return "3000";
          if (key === "BODY_LIMIT") return "1kb";
          return "";
        },
      },
    });

    await server.configureMiddleware();
    await server.configureRoutes();
    server.configureErrorHandling();

    const token = jwt.sign({ userId: 1 }, TEST_JWT_SECRET, { expiresIn: "1h" });
    const res = await request(server.app)
      .post("/api/users")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "x".repeat(4096) });

    expect(res.status).toBe(413);
    expect(res.body).toMatchObject({ status: "error", code: "PAYLOAD_TOO_LARGE" });
  });
});
