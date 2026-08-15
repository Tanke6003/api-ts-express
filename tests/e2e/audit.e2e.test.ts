// tests/e2e/audit.e2e.test.ts
//
// La bitácora, que sólo se puede comprobar de verdad con las capas montadas:
// la escribe el repositorio genérico durante una petición real.
import request from "supertest";
import type { Application } from "express";
import { bootstrap } from "./support/api";

let app: Application;
let auth: string;

beforeAll(async () => {
  ({ app, auth } = await bootstrap());
});

// ==============================================================  bitácora  ==
describe("bitácora", () => {
  it("registra el rastro completo de un recurso a nombre de quien lo tocó", async () => {
    const { body: sucursal } = await request(app)
      .post("/api/branches")
      .set("Authorization", auth)
      .send({ name: "Sucursal Auditada" });

    await request(app)
      .put(`/api/branches/${sucursal.id}`)
      .set("Authorization", auth)
      .send({ name: "Sucursal Auditada v2" });
    await request(app).delete(`/api/branches/${sucursal.id}`).set("Authorization", auth);

    const res = await request(app)
      .get(`/api/audit?entity=BRANCHES&entityId=${sucursal.id}`)
      .set("Authorization", auth);

    const acciones = res.body.data.map((e: { action: string }) => e.action);
    expect(acciones).toEqual(["SOFT_DELETE", "UPDATE", "INSERT"]);
    expect(res.body.data.every((e: { changedBy: string }) => e.changedBy === "Ruben")).toBe(true);

    const update = res.body.data.find((e: { action: string }) => e.action === "UPDATE");
    expect(update.changes.before.name).toBe("Sucursal Auditada");
    expect(update.changes.after.name).toBe("Sucursal Auditada v2");
  });

  it("es de sólo lectura", async () => {
    expect((await request(app).post("/api/audit").set("Authorization", auth)).status).toBe(404);
  });
});
