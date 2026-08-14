import { AuditController } from "../../../src/presentation/controllers/audit.controller";
import { MemoryGenericRepository } from "../../../src/infrastructure/repositories/base/drivers/memory.generic.repository";
import { AsyncRequestContextPlugin } from "../../../src/infrastructure/plugins/asyncRequestContext.plugin";
import { AUDIT_LOG_ENTITY } from "../../../src/infrastructure/repositories/entities";
import type { IAuditLog } from "../../../src/domain/models/audit-log.model";

const mockRes = () => {
  const res: any = {};
  res.json = jest.fn().mockReturnValue(res);
  res.status = jest.fn().mockReturnValue(res);
  return res;
};

describe("AuditController", () => {
  let store: MemoryGenericRepository<IAuditLog>;
  let controller: AuditController;
  let res: any;
  let next: jest.Mock;

  const body = () => res.json.mock.calls[0][0];

  beforeEach(async () => {
    store = new MemoryGenericRepository<IAuditLog>(AUDIT_LOG_ENTITY, []);
    controller = new AuditController(store, new AsyncRequestContextPlugin());
    res = mockRes();
    next = jest.fn();

    await store.insertMany([
      {
        entity: "BRANCHES",
        entityId: "1",
        action: "INSERT",
        changedBy: "Ruben",
        requestId: "req-1",
        changes: JSON.stringify({ after: { name: "Centro" } }),
      },
      {
        entity: "BRANCHES",
        entityId: "1",
        action: "UPDATE",
        changedBy: "Ana",
        requestId: "req-2",
        changes: JSON.stringify({ before: { name: "Centro" }, after: { name: "Norte" } }),
      },
      {
        entity: "APPOINTMENTS",
        entityId: "9",
        action: "SOFT_DELETE",
        changedBy: "Ruben",
        requestId: "req-3",
      },
    ]);
  });

  it("devuelve lo más reciente primero", async () => {
    await controller.getAll({ validatedQuery: { page: 1, limit: 10 } } as never, res, next);

    expect(body().total).toBe(3);
    expect(body().data.map((e: { action: string }) => e.action)).toEqual([
      "SOFT_DELETE",
      "UPDATE",
      "INSERT",
    ]);
  });

  it("devuelve el detalle ya parseado, no como texto", async () => {
    await controller.getAll({ validatedQuery: { page: 1, limit: 10 } } as never, res, next);

    const update = body().data.find((e: { action: string }) => e.action === "UPDATE");
    expect(update.changes).toEqual({ before: { name: "Centro" }, after: { name: "Norte" } });
  });

  it("una línea sin detalle no rompe la respuesta", async () => {
    await controller.getAll({ validatedQuery: { page: 1, limit: 10 } } as never, res, next);

    const deleted = body().data.find((e: { action: string }) => e.action === "SOFT_DELETE");
    expect(deleted.changes).toBeNull();
  });

  // Un JSON corrupto o truncado se devuelve tal cual en vez de tumbar la consulta.
  it("tolera un detalle que no es JSON válido", async () => {
    await store.insert({ entity: "USERS", action: "INSERT", changedBy: "x", changes: "{roto" });

    await controller.getAll({ validatedQuery: { page: 1, limit: 10 } } as never, res, next);

    expect(body().data[0].changes).toBe("{roto");
  });

  describe("filtros", () => {
    const filterBy = async (query: Record<string, unknown>) => {
      res = mockRes();
      await controller.getAll(
        { validatedQuery: { page: 1, limit: 10, ...query } } as never,
        res,
        next
      );
      return body().data;
    };

    it("por entidad, sin distinguir mayúsculas", async () => {
      expect(await filterBy({ entity: "branches" })).toHaveLength(2);
    });

    it("por fila concreta", async () => {
      expect(await filterBy({ entity: "BRANCHES", entityId: "1" })).toHaveLength(2);
    });

    it("por acción", async () => {
      expect(await filterBy({ action: "UPDATE" })).toHaveLength(1);
    });

    it("por autor, con coincidencia parcial", async () => {
      expect(await filterBy({ changedBy: "rub" })).toHaveLength(2);
    });

    // Permite reconstruir todo lo que hizo una misma petición.
    it("por id de petición", async () => {
      expect(await filterBy({ requestId: "req-2" })).toHaveLength(1);
    });
  });

  it("aplica valores por defecto si no hay query validada", async () => {
    await controller.getAll({} as never, res, next);

    expect(body()).toMatchObject({ page: 1, limit: 20 });
  });

  it("delega el error en next", async () => {
    jest.spyOn(store, "getPaged").mockRejectedValue(new Error("boom"));

    await controller.getAll({ validatedQuery: { page: 1, limit: 10 } } as never, res, next);

    expect(next).toHaveBeenCalledWith(expect.any(Error));
    expect(res.json).not.toHaveBeenCalled();
  });
});
