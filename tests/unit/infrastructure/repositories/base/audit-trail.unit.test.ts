import { MemoryGenericRepository } from "../../../../../src/infrastructure/repositories/base/drivers/memory.generic.repository";
import { OracleGenericRepository } from "../../../../../src/infrastructure/repositories/base/drivers/oracle.generic.repository";
import { MemoryAuditTrail } from "../../../../../src/infrastructure/repositories/base/audit-trail";
import { AsyncRequestContextPlugin } from "../../../../../src/infrastructure/plugins/asyncRequestContext.plugin";
import { AUDIT_LOG_ENTITY } from "../../../../../src/infrastructure/repositories/entities";
import type { IAuditLog } from "../../../../../src/domain/models/audit-log.model";
import { defineEntity } from "../../../../../src/infrastructure/repositories/base/entity-metadata";
import { FakeSqlExecutor, silentLogger } from "./fake-sql-executor";
import { ITestItem, TEST_ENTITY } from "./test-entity";

/** La entidad de prueba, pero con la bitácora activada. */
const TRACKED_ENTITY = defineEntity<ITestItem>({
  ...TEST_ENTITY,
  table: "ITEMS",
  auditTrail: true,
});

describe("bitácora de cambios", () => {
  let context: AsyncRequestContextPlugin;
  let auditStore: MemoryGenericRepository<IAuditLog>;
  let trail: MemoryAuditTrail;
  let repository: MemoryGenericRepository<ITestItem>;

  const entries = () => auditStore.getAll({ orderBy: { field: "pkAudit" } });
  const asUser = <T>(name: string, fn: () => T): T =>
    context.run({ requestId: "req-42", user: { id: "7", name, email: null } }, fn);

  beforeEach(() => {
    context = new AsyncRequestContextPlugin();
    auditStore = new MemoryGenericRepository<IAuditLog>(AUDIT_LOG_ENTITY, []);
    trail = new MemoryAuditTrail(auditStore, context);
    repository = new MemoryGenericRepository<ITestItem>(TRACKED_ENTITY, [], context, trail);
  });

  // ==============================================================  opt-in  ==
  it("no registra nada si la entidad no la activa", async () => {
    const untracked = new MemoryGenericRepository<ITestItem>(TEST_ENTITY, [], context, trail);

    await untracked.insert({ name: "alpha" });

    expect(await auditStore.count()).toBe(0);
  });

  // La propia tabla de bitácora no la activa: registrarse a sí misma sería
  // recursivo.
  it("AUDIT_LOG no tiene la bitácora activada", () => {
    expect(AUDIT_LOG_ENTITY.auditTrail).toBeUndefined();
  });

  // ============================================================  acciones  ==
  it("registra el alta con los valores escritos", async () => {
    const created = await asUser("Ruben", () => repository.insert({ name: "alpha", qty: 10 }));

    const [entry] = await entries();
    expect(entry).toMatchObject({
      entity: "ITEMS",
      entityId: String(created.pkItem),
      action: "INSERT",
      changedBy: "Ruben",
      requestId: "req-42",
    });

    const changes = JSON.parse(entry.changes!);
    expect(changes.after).toMatchObject({ name: "alpha", qty: 10 });
  });

  it("registra el antes y el después de una actualización", async () => {
    const created = await asUser("Ana", () => repository.insert({ name: "alpha" }));
    await asUser("Beto", () => repository.update(created.pkItem, { name: "beta" }));

    const [, update] = await entries();
    expect(update).toMatchObject({ action: "UPDATE", changedBy: "Beto" });

    const changes = JSON.parse(update.changes!);
    expect(changes.before.name).toBe("alpha");
    expect(changes.after.name).toBe("beta");
  });

  it("registra los dos tipos de borrado y la restauración", async () => {
    const created = await asUser("Ana", () => repository.insert({ name: "alpha" }));

    await asUser("Ana", () => repository.softDelete(created.pkItem));
    await asUser("Ana", () => repository.restore(created.pkItem));
    await asUser("Ana", () => repository.hardDelete(created.pkItem));

    expect((await entries()).map((e) => e.action)).toEqual([
      "INSERT",
      "SOFT_DELETE",
      "RESTORE",
      "HARD_DELETE",
    ]);
  });

  // Es el caso que justifica tener bitácora además de CREATED_BY/UPDATED_BY:
  // la fila ya no existe, pero su último estado sí quedó registrado.
  it("el borrado físico conserva el último estado de la fila", async () => {
    const created = await asUser("Ana", () => repository.insert({ name: "alpha", qty: 7 }));
    await asUser("Ana", () => repository.hardDelete(created.pkItem));

    const last = (await entries()).at(-1)!;
    expect(JSON.parse(last.changes!).before).toMatchObject({ name: "alpha", qty: 7 });
  });

  it("una operación fallida no deja línea", async () => {
    expect(await repository.softDelete(999)).toBe(false);
    expect(await repository.hardDelete(999)).toBe(false);

    expect(await auditStore.count()).toBe(0);
  });

  it("las operaciones masivas registran una sola línea con el alcance", async () => {
    await repository.insertMany([{ name: "a" }, { name: "b" }]);
    await repository.updateWhere({ name: "a" }, { qty: 5 });
    await repository.hardDeleteWhere({ name: "b" });

    const actions = (await entries()).map((e) => e.action);
    expect(actions).toEqual(["INSERT_MANY", "UPDATE_MANY", "HARD_DELETE_MANY"]);

    const [insertMany, updateMany] = await entries();
    expect(JSON.parse(insertMany.changes!)).toEqual({ affected: 2 });
    expect(JSON.parse(updateMany.changes!)).toMatchObject({ affected: 1 });
  });

  it("fuera de una petición queda a nombre de System y sin requestId", async () => {
    await repository.insert({ name: "seed" });

    const [entry] = await entries();
    expect(entry).toMatchObject({ changedBy: "System", requestId: null });
  });

  it("recorta un detalle desmedido en vez de reventar la columna", async () => {
    await repository.insert({ name: "x".repeat(6000) });

    const [entry] = await entries();
    expect(entry.changes!.length).toBeLessThanOrEqual(4000);
    expect(entry.changes!.endsWith("...")).toBe(true);
  });

  it("serializa las fechas en ISO", async () => {
    await repository.insert({ name: "alpha", dueAt: new Date("2026-05-01T10:00:00.000Z") });

    const changes = JSON.parse((await entries())[0].changes!);
    expect(changes.after.dueAt).toBe("2026-05-01T10:00:00.000Z");
  });
});

describe("SqlAuditTrail", () => {
  // La línea de bitácora se escribe por el mismo executor que la operación
  // auditada; dentro de una transacción entra en el mismo commit.
  it("escribe por el executor del repositorio auditado", async () => {
    const db = new FakeSqlExecutor();
    const auditStore = new MemoryGenericRepository<IAuditLog>(AUDIT_LOG_ENTITY, []);
    const trail = new MemoryAuditTrail(auditStore);

    const repository = new OracleGenericRepository<ITestItem>(
      db,
      TRACKED_ENTITY,
      silentLogger,
      undefined,
      trail
    );

    db.queue({ outBinds: { insertedId: [1] } }).queue({ rows: [{ PK_ITEM: 1, NAME: "alpha" }] });
    await repository.insert({ name: "alpha" });

    expect((await auditStore.getAll())[0]).toMatchObject({
      entity: "ITEMS",
      entityId: "1",
      action: "INSERT",
    });
  });

  it("bindTo devuelve una bitácora atada a la transacción", () => {
    const auditStore = new MemoryGenericRepository<IAuditLog>(AUDIT_LOG_ENTITY, []);
    const trail = new MemoryAuditTrail(auditStore);

    // En memoria no hay conexión que atar: la misma instancia sirve.
    expect(trail.bindTo()).toBe(trail);
  });
});
