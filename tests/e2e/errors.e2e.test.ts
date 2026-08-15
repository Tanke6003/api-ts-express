// tests/e2e/errors.e2e.test.ts
//
// El envoltorio de error, común a toda la API. No es de ningún módulo: se
// comprueba una vez y vale para todos.
import request from "supertest";
import type { Application } from "express";
import { bootstrap } from "./support/api";

let app: Application;
let auth: string;

beforeAll(async () => {
  ({ app, auth } = await bootstrap());
});

// ===============================================  errores e identidad  ======
describe("respuestas de error", () => {
  it("todas comparten el mismo envoltorio, con id de petición", async () => {
    const res = await request(app).get("/api/branches/999999").set("Authorization", auth);

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ status: "error", code: "NOT_FOUND", method: "GET" });
    expect(res.body.requestId).toEqual(expect.any(String));
    expect(res.headers["x-request-id"]).toBe(res.body.requestId);
  });

  it("un id que no es número se rechaza antes de consultar", async () => {
    const res = await request(app).get("/api/branches/abc").set("Authorization", auth);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("BAD_REQUEST");
  });

  it("la validación detalla el campo que falla", async () => {
    const res = await request(app)
      .post("/api/branches")
      .set("Authorization", auth)
      .send({ name: "" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(res.body.errors[0].field).toBe("name");
  });

  it("un JSON mal formado también responde con el envoltorio", async () => {
    const res = await request(app)
      .post("/api/branches")
      .set("Authorization", auth)
      .set("Content-Type", "application/json")
      .send('{"roto');

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("MALFORMED_JSON");
  });

  it("una ruta inexistente devuelve 404 en JSON, no el HTML de Express", async () => {
    const res = await request(app).get("/api/no-existe").set("Authorization", auth);

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("ROUTE_NOT_FOUND");
  });

  it("sin token no se pasa", async () => {
    const res = await request(app).get("/api/branches");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("NO_TOKEN");
  });

  it("propaga el id de petición que llega de fuera", async () => {
    const res = await request(app)
      .get("/api/no-existe")
      .set("x-request-id", "trace-integracion-1");

    expect(res.body.requestId).toBe("trace-integracion-1");
  });
});
