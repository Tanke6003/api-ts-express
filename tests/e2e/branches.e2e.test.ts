// tests/e2e/branches.e2e.test.ts
//
// Flujo completo de una sucursal por HTTP: alta, consulta, edición, baja
// lógica, restauración y baja física, más la transacción que arrastra su agenda.
import request from "supertest";
import type { Application } from "express";
import { bootstrap, future } from "./support/api";

let app: Application;
let auth: string;

beforeAll(async () => {
  ({ app, auth } = await bootstrap());
});

// ============================================================  sucursales  ===
describe("ciclo de vida de una sucursal", () => {
  let id: number;

  it("la crea", async () => {
    const res = await request(app)
      .post("/api/branches")
      .set("Authorization", auth)
      .send({ name: "Sucursal Prueba", address: "Calle 1", opensAt: "09:00", closesAt: "18:00" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ name: "Sucursal Prueba", available: true });
    id = res.body.id;
  });

  it("la devuelve por id y en el listado", async () => {
    expect((await request(app).get(`/api/branches/${id}`).set("Authorization", auth)).status).toBe(
      200
    );

    const list = await request(app).get("/api/branches?limit=100").set("Authorization", auth);
    expect(list.body.data.some((b: { id: number }) => b.id === id)).toBe(true);
  });

  it("la encuentra buscando sin distinguir mayúsculas", async () => {
    const res = await request(app).get("/api/branches?search=PRUEBA").set("Authorization", auth);

    expect(res.body.data.map((b: { id: number }) => b.id)).toContain(id);
  });

  it("la actualiza sin tocar lo que no viene en el cuerpo", async () => {
    const res = await request(app)
      .put(`/api/branches/${id}`)
      .set("Authorization", auth)
      .send({ name: "Sucursal Prueba v2" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: "Sucursal Prueba v2", address: "Calle 1" });
  });

  it("el borrado lógico la oculta pero la conserva", async () => {
    expect(
      (await request(app).delete(`/api/branches/${id}`).set("Authorization", auth)).status
    ).toBe(204);

    expect((await request(app).get(`/api/branches/${id}`).set("Authorization", auth)).status).toBe(
      404
    );

    const conBorradas = await request(app)
      .get("/api/branches?withDeleted=true&limit=100")
      .set("Authorization", auth);
    expect(conBorradas.body.data.find((b: { id: number }) => b.id === id)).toMatchObject({
      available: false,
    });
  });

  it("la restaura", async () => {
    expect(
      (await request(app).post(`/api/branches/${id}/restore`).set("Authorization", auth)).status
    ).toBe(200);

    expect((await request(app).get(`/api/branches/${id}`).set("Authorization", auth)).status).toBe(
      200
    );
  });

  it("el borrado físico la elimina de verdad", async () => {
    expect(
      (await request(app).delete(`/api/branches/${id}/hard`).set("Authorization", auth)).status
    ).toBe(204);

    const conBorradas = await request(app)
      .get("/api/branches?withDeleted=true&limit=100")
      .set("Authorization", auth);
    expect(conBorradas.body.data.find((b: { id: number }) => b.id === id)).toBeUndefined();
  });
});

// ==========================================================  transacción  ===
describe("baja de sucursal en transacción", () => {
  it("cancela las citas futuras de la sucursal que se da de baja", async () => {
    const { body: sucursal } = await request(app)
      .post("/api/branches")
      .set("Authorization", auth)
      .send({ name: "Sucursal Efímera" });

    await request(app)
      .post("/api/appointments")
      .set("Authorization", auth)
      .send({ branchId: sucursal.id, guestName: "Afectado", scheduledAt: future(400) });

    await request(app).delete(`/api/branches/${sucursal.id}`).set("Authorization", auth);

    const citas = await request(app)
      .get(`/api/appointments?branchId=${sucursal.id}`)
      .set("Authorization", auth);

    expect(citas.body.data.every((a: { status: string }) => a.status === "CANCELLED")).toBe(true);
  });

  // Las citas referencian la sucursal por clave foránea: si el borrado no
  // arrastrara las citas, la base lo rechazaría.
  it("el borrado físico se lleva por delante las citas de la sucursal", async () => {
    const { body: sucursal } = await request(app)
      .post("/api/branches")
      .set("Authorization", auth)
      .send({ name: "Sucursal Condenada" });

    await request(app)
      .post("/api/appointments")
      .set("Authorization", auth)
      .send({ branchId: sucursal.id, guestName: "Condenado", scheduledAt: future(500) });

    expect(
      (await request(app).delete(`/api/branches/${sucursal.id}/hard`).set("Authorization", auth))
        .status
    ).toBe(204);

    const citas = await request(app)
      .get(`/api/appointments?branchId=${sucursal.id}&withDeleted=true`)
      .set("Authorization", auth);

    expect(citas.body.data).toHaveLength(0);
  });
});
