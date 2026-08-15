// tests/unit/infrastructure/plugins/healthProbe.plugin.unit.test.ts
import { HealthProbePlugin } from "../../../../src/infrastructure/plugins/healthProbe.plugin";

describe("HealthProbePlugin", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  describe("sin conexión (driver de memoria)", () => {
    const probe = () => new HealthProbePlugin({ dataSource: "memory" });

    it("está listo: no hay nada que comprobar", async () => {
      await expect(probe().report()).resolves.toEqual({
        ready: true,
        dataSource: "memory",
        database: "not_applicable",
        shuttingDown: false,
      });
    });
  });

  describe("con conexión", () => {
    it("informa `up` cuando la base responde", async () => {
      const connection = { authenticate: jest.fn().mockResolvedValue(undefined) };
      const probe = new HealthProbePlugin({ connection, dataSource: "postgres" });

      await expect(probe.report()).resolves.toMatchObject({ ready: true, database: "up" });
    });

    it("informa `down` en vez de propagar el fallo", async () => {
      const connection = { authenticate: jest.fn().mockRejectedValue(new Error("ECONNREFUSED")) };
      const probe = new HealthProbePlugin({ connection, dataSource: "postgres" });

      // Que la base no esté *es* la respuesta, no un error que propagar: si
      // lanzara, el sondeo respondería un 500 en vez de un 503.
      await expect(probe.report()).resolves.toMatchObject({
        ready: false,
        database: "down",
        shuttingDown: false,
      });
    });

    it("da por caída una base que acepta pero no responde", async () => {
      // Nunca resuelve: es el caso que deja colgado un sondeo sin tope.
      const connection = { authenticate: jest.fn(() => new Promise<void>(() => {})) };
      const probe = new HealthProbePlugin({ connection, dataSource: "oracle", timeoutMs: 20 });

      await expect(probe.report()).resolves.toMatchObject({ ready: false, database: "down" });
    });

    it("cachea el resultado para que los sondeos no golpeen la base", async () => {
      const connection = { authenticate: jest.fn().mockResolvedValue(undefined) };
      const probe = new HealthProbePlugin({ connection, dataSource: "mysql", ttlMs: 10_000 });

      await probe.report();
      await probe.report();
      await probe.report();

      expect(connection.authenticate).toHaveBeenCalledTimes(1);
    });

    it("vuelve a preguntar cuando la caché caduca", async () => {
      const connection = { authenticate: jest.fn().mockResolvedValue(undefined) };
      const probe = new HealthProbePlugin({ connection, dataSource: "mysql", ttlMs: 5 });

      await probe.report();
      await new Promise((resolve) => setTimeout(resolve, 15));
      await probe.report();

      expect(connection.authenticate).toHaveBeenCalledTimes(2);
    });
  });

  describe("apagado", () => {
    it("deja de estar listo aunque la base siga en pie", async () => {
      const connection = { authenticate: jest.fn().mockResolvedValue(undefined) };
      const probe = new HealthProbePlugin({ connection, dataSource: "postgres" });

      await expect(probe.report()).resolves.toMatchObject({ ready: true });

      probe.beginShutdown();

      await expect(probe.report()).resolves.toMatchObject({
        ready: false,
        database: "up",
        shuttingDown: true,
      });
    });

    it("el drenaje se ve en el siguiente sondeo, sin esperar a que caduque la caché", async () => {
      const connection = { authenticate: jest.fn().mockResolvedValue(undefined) };
      const probe = new HealthProbePlugin({ connection, dataSource: "postgres", ttlMs: 60_000 });

      await probe.report();
      probe.beginShutdown();

      await expect(probe.report()).resolves.toMatchObject({ ready: false, shuttingDown: true });
    });
  });
});
