// tests/users.e2e.test.ts
import "reflect-metadata"; 
import "../../src/core/di/container"; 
import request from "supertest";
import { Server } from "../../src/core/server";
import { DotenvPlugin } from "../../src/infrastructure/plugins/dotenv.plugin";

let app: any;

beforeAll(async () => {
  const envs = new DotenvPlugin();
  const port = Number(envs.getEnv("PORT") ?? 4000);
  const server = new Server(port);
  await server.configureMiddleware();
  await server.configureRoutes();
  app = server.app;
});

describe("Users API", () => {
  it("should return 200 and a list of users", async () => {
    const res = await request(app).get("/api/users");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("should create a new user", async () => {
    const res = await request(app)
      .post("/api/users")
      .send({ name: "Test User" });
    expect(res.status).toBe(201);
  });
});
