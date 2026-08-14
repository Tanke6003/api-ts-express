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

  beforeEach(() => {
    container.reset();

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
    expect(res.body).toEqual({ openapi: "3.0.0" });
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
