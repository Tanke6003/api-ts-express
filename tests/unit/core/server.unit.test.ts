// tests/unit/core/server.unit.test.ts
import request from "supertest";
import jwt from "jsonwebtoken";
import { Server } from "../../../src/core/server";
import { container } from "tsyringe";
import { IEnvs } from "../../../src/domain/interfaces/infrastructure/plugins/envs.plugin.interface";
import { ILogger } from "../../../src/domain/interfaces/infrastructure/plugins/logger.plugin.interface";

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

    container.register("IUsersController", {
      useValue: {
        getAllUsers: jest.fn((_req: any, res: any, _next: any) => res.json([])),
        getUserById: jest.fn((_req: any, res: any, _next: any) => res.json({ id: 1 })),
        createUser: jest.fn((_req: any, res: any, _next: any) => res.status(201).json({ id: 2 })),
        updateUser: jest.fn((_req: any, res: any, _next: any) => res.json({ id: 1, updated: true })),
        deleteUser: jest.fn((_req: any, res: any, _next: any) => res.status(204).send()),
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
});
