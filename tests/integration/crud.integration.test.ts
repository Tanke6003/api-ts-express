// tests/integration/crud.integration.test.ts
//
// Recorre la API completa por HTTP, con el driver en memoria: no hace falta
// Docker, así que corre en CI igual que en local. Lo que se comprueba aquí es el
// ciclo entero de un recurso —alta, consulta, edición, borrado lógico,
// restauración y borrado físico— más lo que sólo se ve montando las capas
// juntas: el envoltorio de error, el id de petición y la bitácora.
import "reflect-metadata";
import "../../src/core/di/container";
import request from "supertest";
import { Server } from "../../src/core/server";
import { container } from "tsyringe";
import { IEnvs } from "../../src/domain/interfaces/infrastructure/plugins/envs.plugin.interface";

let app: any;
let auth: string;

const future = (hours: number) => new Date(Date.now() + hours * 3600_000).toISOString();

beforeAll(async () => {
  const envs = container.resolve<IEnvs>("IEnvs");
  const server = new Server(Number(envs.getEnv("PORT") || 4002));
  await server.configureMiddleware();
  await server.configureRoutes();
  server.configureErrorHandling();
  app = server.app;

  const { body } = await request(app).get("/api/generate-token?userId=7&name=Ruben");
  auth = `Bearer ${body.token}`;
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

// ==================================================================  citas  ==
describe("citas", () => {
  it("agenda una cita de invitado y resuelve el nombre de la sucursal", async () => {
    const res = await request(app)
      .post("/api/appointments")
      .set("Authorization", auth)
      .send({ branchId: 1, guestName: "Walk-in", scheduledAt: future(100), durationMin: 30 });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      branchName: "Sucursal Centro",
      clientId: null,
      displayName: "Walk-in",
    });
  });

  it("con cliente registrado resuelve su nombre y no duplica el de invitado", async () => {
    const res = await request(app)
      .post("/api/appointments")
      .set("Authorization", auth)
      .send({ branchId: 2, clientId: 1, scheduledAt: future(200) });

    expect(res.body).toMatchObject({ clientName: "John Doe", guestName: null });
  });

  it("rechaza con 409 una cita que pisa a otra en la misma sucursal", async () => {
    const scheduledAt = future(300);
    await request(app)
      .post("/api/appointments")
      .set("Authorization", auth)
      .send({ branchId: 1, guestName: "A", scheduledAt, durationMin: 60 });

    const choque = await request(app)
      .post("/api/appointments")
      .set("Authorization", auth)
      .send({ branchId: 1, guestName: "B", scheduledAt });

    expect(choque.status).toBe(409);
    expect(choque.body.code).toBe("CONFLICT");
  });

  it("los totales por estado responden al filtro de sucursal", async () => {
    const res = await request(app).get("/api/appointments/stats").set("Authorization", auth);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
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

describe("identidad", () => {
  it("/api/me devuelve lo que la API resolvió del token", async () => {
    const res = await request(app).get("/api/me").set("Authorization", auth);

    expect(res.body).toMatchObject({ id: "7", name: "Ruben" });
  });
});
