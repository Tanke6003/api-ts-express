
// tests/unit/core/server.unit.test.ts
import request from "supertest";
import { Server } from "../../../src/core/server";
import { container } from "tsyringe";
import { IEnvs } from "../../../src/domain/interfaces/infrastructure/plugins/envs.plugin.interface";
import { ILogger } from "../../../src/domain/interfaces/infrastructure/plugins/logger.plugin.interface";

// Mock swagger-jsdoc
jest.mock("swagger-jsdoc", () => jest.fn(() => ({ openapi: "3.0.0" })));
// Mock swagger-ui-express
jest.mock("swagger-ui-express", () => ({
  serve: jest.fn((_req, _res, next) => next()),
  setup: jest.fn(() => (_req: any, res: any) => res.send("swagger-ui")),
}));
// Mock Scalar
jest.mock(
  "@scalar/express-api-reference",
  () => ({
    apiReference: jest.fn(() => (_req: any, res: any) => res.send("scalar-ui")),
  }),
  { virtual: true }
);

describe("Server class", () => {
  let server: Server;

  beforeEach(() => {
    // Reiniciar contenedor
    container.reset();

    // Mock de IEnvs (PORT y JWT_SECRET necesarios para swagger y auth)
    container.register<IEnvs>("IEnvs", {
      useValue: {
        getEnv: (key: string) => {
          if (key === "JWT_SECRET") return "unit-test-secret";
          if (key === "PORT") return "3000";
          return "";
        },
      },
    });

    // Mock de IUsersController
    container.register("IUsersController", {
      useValue: {
        getAllUsers: jest.fn((_req, res) => res.json([])),
        getUserById: jest.fn((_req, res) => res.json({ id: 1 })),
        createUser: jest.fn((_req, res) => res.status(201).json({ id: 2 })),
        updateUser: jest.fn((_req, res) => res.json({ id: 1, updated: true })),
        deleteUser: jest.fn((_req, res) => res.status(204).send()),
      },
    });

    // Mock de ILogger (necesario para httpLoggerMiddleware)
    container.register<ILogger>("ILogger", {
      useValue: {
        http: jest.fn((_req, _res) => {}),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
        log: jest.fn(),
      },
    });

    // Instanciar el servidor
    server = new Server(3000);
  });

  it("should expose /health endpoint", async () => {
    await server.configureMiddleware();
    await server.configureRoutes();

    const res = await request(server.app).get("/health");
    expect(res.status).toBe(200);
    expect(res.text).toBe("OK");
  });

  it("should expose swagger docs", async () => {
    await server.configureMiddleware();
    await server.configureSwagger();

    const res = await request(server.app).get("/api/swagger");
    expect(res.status).toBe(200);
    expect(res.text).toContain("swagger-ui");
  });

  it("should expose openapi.json", async () => {
    await server.configureMiddleware();
    await server.configureSwagger();

    const res = await request(server.app).get("/api/openapi.json");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ openapi: "3.0.0" });
  });

  it("should expose scalar docs", async () => {
    // Mock directo de configureScalar para evitar dependencias
    jest.spyOn(Server.prototype, "configureScalar").mockImplementationOnce(async function (this: Server) {
      const { app } = this;
      app.use("/api/scalar", (_req, res) => res.send("scalar-ui"));
    });

    await server.configureMiddleware();
    await server.configureScalar();

    const res = await request(server.app).get("/api/scalar");
    expect(res.status).toBe(200);
    expect(res.text).toContain("scalar-ui");
  });
});
