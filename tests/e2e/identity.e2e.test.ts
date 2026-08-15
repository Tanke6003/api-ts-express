// tests/e2e/identity.e2e.test.ts
//
// La identidad que la API resuelve del token: la misma que el repositorio
// genérico escribe en las columnas de auditoría. Sólo se puede comprobar con
// las capas montadas, porque nace en el guard y viaja por el contexto.
import request from "supertest";
import type { Application } from "express";
import { bootstrap } from "./support/api";

describe("identidad", () => {
  let app: Application;
  let auth: string;

  beforeAll(async () => {
    ({ app, auth } = await bootstrap("7", "Ruben"));
  });

  it("devuelve lo que la API resolvió del token", async () => {
    const res = await request(app).get("/api/v1/me").set("Authorization", auth);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: "7", name: "Ruben" });
    // El id de petición viaja con la identidad: es lo que se cita al soporte.
    expect(res.body.requestId).toEqual(expect.any(String));
  });

  it("el emisor de desarrollo trae valores por defecto", async () => {
    const { auth: porDefecto } = await bootstrap("1", "Dev%20User");

    const res = await request(app).get("/api/v1/me").set("Authorization", porDefecto);

    expect(res.body).toMatchObject({ id: "1" });
  });

  it("exige token", async () => {
    expect((await request(app).get("/api/v1/me")).status).toBe(401);
  });

  it("rechaza un token de otra firma", async () => {
    const res = await request(app).get("/api/v1/me").set("Authorization", "Bearer no-es-un-token");

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_TOKEN");
  });
});
