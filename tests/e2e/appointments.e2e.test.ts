// tests/e2e/appointments.e2e.test.ts
//
// Flujo completo de una cita por HTTP, incluidas sus reglas de negocio vistas
// desde fuera: el solape y la concurrencia.
import request from "supertest";
import type { Application } from "express";
import { bootstrap, future } from "./support/api";

let app: Application;
let auth: string;

beforeAll(async () => {
  ({ app, auth } = await bootstrap());
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

  it("diez peticiones simultáneas por el mismo hueco sólo agendan una", async () => {
    const scheduledAt = future(400);
    const intento = (n: number) =>
      request(app)
        .post("/api/appointments")
        .set("Authorization", auth)
        .send({ branchId: 1, guestName: `Concurrente ${n}`, scheduledAt, durationMin: 30 });

    const respuestas = await Promise.all(Array.from({ length: 10 }, (_, n) => intento(n)));

    // Qué prueba esto y qué no: contra el driver de memoria no llega a
    // entrelazarse nada aunque se quite la exclusión, porque sin E/S real cada
    // petición recorre el servicio entera en un mismo turno del bucle de
    // eventos. Es decir, aquí esto es un guardián del contrato del endpoint
    // —una sola cita gana el hueco—, no la prueba de que la carrera esté
    // cerrada; esa es la de MemoryUnitOfWork, que fuerza el entrelazado con un
    // `setImmediate` a mitad de la transacción.
    //
    // El mismo test contra un motor real (DATA_SOURCE=postgres) sí ejercita el
    // bloqueo: ahí cada sentencia es un viaje por red y las diez transacciones
    // se solapan de verdad.
    expect(respuestas.filter((r) => r.status === 201)).toHaveLength(1);
    expect(respuestas.filter((r) => r.status === 409)).toHaveLength(9);

    // Y la agenda tiene una sola cita a esa hora, no diez.
    const agenda = await request(app)
      .get(`/api/appointments?branchId=1&from=${scheduledAt}&to=${scheduledAt}`)
      .set("Authorization", auth);

    expect(agenda.body.total).toBe(1);
  });

  it("los totales por estado responden al filtro de sucursal", async () => {
    const res = await request(app).get("/api/appointments/stats").set("Authorization", auth);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
