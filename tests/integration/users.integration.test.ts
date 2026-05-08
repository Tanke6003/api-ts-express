// tests/integration/users.integration.test.ts
// Requires no external database — uses the DummyDataSource configured in the DI container.
import "reflect-metadata";
import "../../src/core/di/container";
import request from "supertest";
import { Server } from "../../src/core/server";
import { container } from "tsyringe";
import { IEnvs } from "../../src/domain/interfaces/infrastructure/plugins/envs.plugin.interface";

let app: any;
let bearerToken: string;

beforeAll(async () => {
  const envs = container.resolve<IEnvs>("IEnvs");
  const port = Number(envs.getEnv("PORT") || 4001);
  const server = new Server(port);
  await server.configureMiddleware();
  await server.configureRoutes();
  app = server.app;

  const tokenRes = await request(app).get("/api/generate-token");
  bearerToken = tokenRes.body.token;
});

// ===========================
// Health
// ===========================
describe("GET /health", () => {
  it("returns 200 with status ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "ok" });
    expect(res.body).toHaveProperty("timestamp");
    expect(res.body).toHaveProperty("uptime");
  });
});

// ===========================
// GET /api/users
// ===========================
describe("GET /api/users", () => {
  it("returns 200 with an array of users", async () => {
    const res = await request(app).get("/api/users");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });
});

// ===========================
// GET /api/users/:id
// ===========================
describe("GET /api/users/:id", () => {
  it("returns 200 with user data for an existing user", async () => {
    const res = await request(app).get("/api/users/1");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 1 });
    expect(res.body).toHaveProperty("name");
  });

  it("returns 404 for a non-existing user", async () => {
    const res = await request(app).get("/api/users/9999");
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ message: "User not found" });
  });
});

// ===========================
// POST /api/users
// ===========================
describe("POST /api/users", () => {
  it("returns 401 without Authorization header", async () => {
    const res = await request(app)
      .post("/api/users")
      .send({ name: "Unauthorized User" });
    expect(res.status).toBe(401);
  });

  it("returns 401 with an invalid token", async () => {
    const res = await request(app)
      .post("/api/users")
      .set("Authorization", "Bearer invalid.token.here")
      .send({ name: "Invalid Token User" });
    expect(res.status).toBe(401);
  });

  it("returns 201 with a valid Bearer token", async () => {
    const res = await request(app)
      .post("/api/users")
      .set("Authorization", `Bearer ${bearerToken}`)
      .send({ name: "Integration Test User" });
    expect(res.status).toBe(201);
  });
});

// ===========================
// PUT /api/users/:id
// ===========================
describe("PUT /api/users/:id", () => {
  it("returns 200 when updating an existing user", async () => {
    const res = await request(app)
      .put("/api/users/2")
      .send({ name: "Updated Name" });
    expect(res.status).toBe(200);
  });

  it("returns 404 when updating a non-existing user", async () => {
    const res = await request(app)
      .put("/api/users/9999")
      .send({ name: "Ghost" });
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ message: "User not found" });
  });
});

// ===========================
// DELETE /api/users/:id
// ===========================
describe("DELETE /api/users/:id", () => {
  it("returns 204 when deleting an existing user", async () => {
    const res = await request(app).delete("/api/users/4");
    expect(res.status).toBe(204);
  });

  it("returns 404 when deleting an already deleted user", async () => {
    await request(app).delete("/api/users/3");
    const res = await request(app).delete("/api/users/3");
    expect(res.status).toBe(404);
  });

  it("returns 404 for a non-existing user", async () => {
    const res = await request(app).delete("/api/users/9999");
    expect(res.status).toBe(404);
  });
});
