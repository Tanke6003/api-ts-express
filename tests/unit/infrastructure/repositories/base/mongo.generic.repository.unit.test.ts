import type { ClientSession } from "mongodb";
import { MongoGenericRepository } from "../../../../../src/infrastructure/repositories/base/drivers/mongo.generic.repository";
import { MongoAuditTrail } from "../../../../../src/infrastructure/repositories/base/audit-trail";
import { QueryBuilder } from "../../../../../src/infrastructure/repositories/base/query/query-builder";
import { defineEntity } from "../../../../../src/infrastructure/repositories/base/entity-metadata";
import { AsyncRequestContextPlugin } from "../../../../../src/infrastructure/plugins/asyncRequestContext.plugin";
import { AUDIT_LOG_ENTITY } from "../../../../../src/infrastructure/repositories/entities";
import type { IAuditLog } from "../../../../../src/domain/models/audit-log.model";
import { FakeMongoDataSource } from "./fake-mongo";
import { silentLogger } from "./fake-sql-executor";
import {
  AUDITED_SOFT_ENTITY,
  IAuditedItem,
  IPlainItem,
  ITestItem,
  PLAIN_ENTITY,
  TEST_ENTITY,
} from "./test-entity";

/** La entidad de prueba con la bitácora activada. */
const TRACKED_ENTITY = defineEntity<ITestItem>({ ...TEST_ENTITY, auditTrail: true });

/**
 * Documentos equivalentes a los que deja el seed de `docker/mongo/init`: PKs
 * escritas a mano, campos en MAYÚSCULAS y flags como 1/0.
 */
const SEED_DOCUMENTS = [
  { PK_ITEM: 1, NAME: "alpha", QTY: 10, TAG: "x", FLAG: 1, ACTIVE: 1, CREATED_AT: new Date("2026-01-01T00:00:00Z") },
  { PK_ITEM: 2, NAME: "beta", QTY: 20, TAG: null, FLAG: 0, ACTIVE: 1, CREATED_AT: new Date("2026-01-02T00:00:00Z") },
  { PK_ITEM: 3, NAME: "gamma", QTY: 30, TAG: "y", FLAG: 1, ACTIVE: 0, CREATED_AT: new Date("2026-01-03T00:00:00Z") },
];

describe("MongoGenericRepository", () => {
  let db: FakeMongoDataSource;
  let repository: MongoGenericRepository<ITestItem>;

  const counters = () => db.documentsOf("_counters");

  beforeEach(() => {
    db = new FakeMongoDataSource();
    db.collectionOf("ITEMS").seed(SEED_DOCUMENTS.map((document) => ({ ...document })));
    repository = new MongoGenericRepository<ITestItem>(db, TEST_ENTITY, silentLogger);
  });

  // ==============================================================  lectura  ==
  describe("lectura", () => {
    it("excluye por defecto lo borrado lógicamente y lo incluye con withDeleted", async () => {
      expect((await repository.getAll()).map((item) => item.name)).toEqual(["alpha", "beta"]);
      expect(await repository.getAll({ withDeleted: true })).toHaveLength(3);
    });

    it("no devuelve nunca el _id: es la PK técnica de Mongo, no del modelo", async () => {
      const [item] = await repository.getAll();

      expect(item).not.toHaveProperty("_id");
      // El documento guardado sí lo tiene: lo quita la proyección, no el seed.
      expect(db.documentsOf("ITEMS")[0]).toHaveProperty("_id");
    });

    it("select proyecta sólo las propiedades pedidas", async () => {
      const [item] = await repository.find({ select: ["name", "qty"], take: 1 });

      expect(item).toEqual({ name: "alpha", qty: 10 });
    });

    it("select rechaza una propiedad no mapeada", async () => {
      await expect(repository.find({ select: ["inventada"] as never })).rejects.toThrow(
        /no está mapeada/
      );
    });

    it("ordena por la propiedad indicada, en ambos sentidos", async () => {
      const asc = await repository.getAll({ orderBy: { field: "qty", direction: "asc" } });
      const desc = await repository.getAll({ orderBy: { field: "qty", direction: "desc" } });

      expect(asc.map((item) => item.qty)).toEqual([10, 20]);
      expect(desc.map((item) => item.qty)).toEqual([20, 10]);
    });

    it("al paginar sin orden cae a la PK, para que dos páginas no se solapen", async () => {
      // Mongo no garantiza el orden natural: sin este respaldo, la página 2
      // podría repetir un documento ya devuelto en la 1.
      const page = await repository.find({ skip: 1, take: 1, withDeleted: true });

      expect(page.map((item) => item.pkItem)).toEqual([2]);
    });

    it("convierte los valores al tipo del modelo", async () => {
      const item = await repository.getById(1);

      expect(item).toMatchObject({ pkItem: 1, name: "alpha", qty: 10, flag: true, active: true });
      expect(item?.createdAt).toBeInstanceOf(Date);
    });

    it("getById devuelve null si el registro está dado de baja, salvo withDeleted", async () => {
      expect(await repository.getById(3)).toBeNull();
      expect(await repository.getById(3, { withDeleted: true })).toMatchObject({ name: "gamma" });
    });

    it("firstOrDefault devuelve null cuando no hay nada que casar", async () => {
      expect(await repository.firstOrDefault({ where: { name: "no existe" } })).toBeNull();
    });

    it("count y exists respetan el filtro de borrado lógico", async () => {
      expect(await repository.count()).toBe(2);
      expect(await repository.count(undefined, true)).toBe(3);
      expect(await repository.exists({ name: "gamma" })).toBe(false);
      expect(await repository.exists({ name: "gamma" }, true)).toBe(true);
    });

    it("getPaged devuelve el total sin paginar y el número de páginas", async () => {
      const paged = await repository.getPaged(2, 1, { orderBy: { field: "qty" } });

      expect(paged).toMatchObject({ total: 2, page: 2, limit: 1, pages: 2 });
      expect(paged.items.map((item) => item.name)).toEqual(["beta"]);
    });

    it("getPaged normaliza una página o un tamaño imposibles", async () => {
      const paged = await repository.getPaged(0, -5);

      expect(paged).toMatchObject({ page: 1, limit: 1 });
    });

    it("query() entrega el mismo constructor de consultas que los demás drivers", async () => {
      const query = repository.query();

      expect(query).toBeInstanceOf(QueryBuilder);
      expect(await query.where({ qty: { gte: 20 } }).count()).toBe(1);
    });
  });

  // =============================================================  secuencia  ==
  describe("PK autonumérica", () => {
    it("arranca el contador por encima de la PK más alta que dejó el seed", async () => {
      // El seed inserta 1..3 sin pasar por el contador; si éste empezara en 1,
      // el primer alta chocaría con una clave ya usada.
      const created = await repository.insert({ name: "delta", qty: 40 });

      expect(created.pkItem).toBe(4);
      expect(counters()).toEqual([expect.objectContaining({ _id: "ITEMS", seq: 4 })]);
    });

    it("a partir de ahí sigue incrementando sin volver a mirar la colección", async () => {
      await repository.insert({ name: "delta" });
      const segunda = await repository.insert({ name: "epsilon" });

      expect(segunda.pkItem).toBe(5);
    });

    it("en una colección vacía empieza por 1", async () => {
      const vacia = new MongoGenericRepository<IAuditedItem>(db, AUDITED_SOFT_ENTITY, silentLogger);

      expect((await vacia.insert({ name: "primero" })).pkItem).toBe(1);
    });

    it("insertMany reserva un bloque de claves consecutivas", async () => {
      const affected = await repository.insertMany([{ name: "d" }, { name: "e" }, { name: "f" }]);

      expect(affected).toBe(3);
      expect((await repository.getAll({ orderBy: { field: "pkItem" } })).map((i) => i.pkItem)).toEqual(
        [1, 2, 4, 5, 6]
      );
    });

    it("insertMany sin nada que insertar no toca el contador", async () => {
      expect(await repository.insertMany([])).toBe(0);
      expect(counters()).toHaveLength(0);
    });
  });

  // ============================================================  escritura  ==
  describe("escritura", () => {
    it("rellena marca de alta, estado inicial y hueco de modificación", async () => {
      const created = await repository.insert({ name: "delta" });
      const [document] = db.documentsOf("ITEMS").filter((row) => row.PK_ITEM === created.pkItem);

      // El validador de la colección rechaza documentos pero no los completa:
      // estos automatismos los tiene que poner el repositorio.
      expect(document.CREATED_AT).toBeInstanceOf(Date);
      expect(document.UPDATED_AT).toBeNull();
      expect(document.ACTIVE).toBe(1);
    });

    it("convierte booleanos y fechas al formato de la colección", async () => {
      const created = await repository.insert({ name: "delta", flag: false, dueAt: new Date("2026-05-01T10:00:00Z") });
      const [document] = db.documentsOf("ITEMS").filter((row) => row.PK_ITEM === created.pkItem);

      expect(document.FLAG).toBe(0);
      expect(document.DUE_AT).toBeInstanceOf(Date);
    });

    it("un insert sin ningún campo que escribir es un error, no un documento vacío", async () => {
      await expect(repository.insert({})).rejects.toThrow(/sin campos que escribir/);
    });

    it("una entidad sin identity exige que la PK llegue en el cuerpo", async () => {
      const plain = new MongoGenericRepository<IPlainItem, string>(db, PLAIN_ENTITY, silentLogger);

      await expect(plain.insert({ label: "sin clave" })).rejects.toThrow(/la PK es obligatoria/);
      expect(await plain.insert({ code: "A1", label: "con clave" })).toMatchObject({ code: "A1" });
    });

    it("update aplica los cambios y sella la fecha de modificación", async () => {
      const updated = await repository.update(1, { name: "alpha v2" });
      const [document] = db.documentsOf("ITEMS").filter((row) => row.PK_ITEM === 1);

      expect(updated).toMatchObject({ name: "alpha v2" });
      expect(document.UPDATED_AT).toBeInstanceOf(Date);
      // La fecha de alta es inmutable: la metadata la marca como no actualizable.
      expect(document.CREATED_AT).toEqual(new Date("2026-01-01T00:00:00Z"));
    });

    it("un update sin campos actualizables devuelve el estado actual, no null", async () => {
      // `null` lo leería el llamador como "no existe", que es otra cosa.
      expect(await repository.update(1, {})).toMatchObject({ name: "alpha" });
    });

    it("update devuelve null si el registro no existe o está dado de baja", async () => {
      expect(await repository.update(99, { name: "x" })).toBeNull();
      expect(await repository.update(3, { name: "x" })).toBeNull();
    });

    it("updateWhere devuelve cuántos alcanzó y no toca a los dados de baja", async () => {
      const affected = await repository.updateWhere({ qty: { gte: 10 } }, { tag: "z" });

      expect(affected).toBe(2);
      expect(await repository.getById(3, { withDeleted: true })).toMatchObject({ tag: "y" });
    });

    it("updateWhere sin campos actualizables no escribe nada", async () => {
      expect(await repository.updateWhere({ qty: { gte: 10 } }, {})).toBe(0);
    });
  });

  // ==============================================================  borrado  ==
  describe("borrado", () => {
    it("el borrado lógico y la restauración son idempotentes", async () => {
      expect(await repository.softDelete(1)).toBe(true);
      expect(await repository.softDelete(1)).toBe(false);
      expect(await repository.restore(1)).toBe(true);
      expect(await repository.restore(1)).toBe(false);
    });

    it("el borrado lógico deja el registro fuera de las lecturas normales", async () => {
      await repository.softDelete(1);

      expect(await repository.getById(1)).toBeNull();
      expect(await repository.getById(1, { withDeleted: true })).not.toBeNull();
    });

    it("una entidad sin softDelete avisa en vez de fingir que borró", async () => {
      const plain = new MongoGenericRepository<IPlainItem, string>(db, PLAIN_ENTITY, silentLogger);

      await expect(plain.softDelete("A1")).rejects.toThrow(/no declara softDelete/);
    });

    it("hardDelete borra de verdad y devuelve false si no había nada", async () => {
      expect(await repository.hardDelete(1)).toBe(true);
      expect(await repository.hardDelete(1)).toBe(false);
      expect(db.documentsOf("ITEMS")).toHaveLength(2);
    });

    it("hardDeleteWhere alcanza también a los borrados lógicamente", async () => {
      // Si no lo hiciera, dejaría documentos huérfanos apuntando a algo que
      // acaba de desaparecer.
      expect(await repository.hardDeleteWhere({ qty: { gte: 20 } })).toBe(2);
      expect(db.documentsOf("ITEMS")).toHaveLength(1);
    });

    it("hardDeleteWhere devuelve 0 cuando el filtro no casa con nada", async () => {
      expect(await repository.hardDeleteWhere({ name: "no existe" })).toBe(0);
    });
  });

  // ==============================================================  sesión  ==
  describe("withSession", () => {
    it("propaga la sesión a todas las operaciones de la copia", async () => {
      const session = { id: "sesion-1" } as unknown as ClientSession;
      const bound = repository.withSession(session);

      await bound.getAll();
      await bound.update(1, { name: "x" });

      const sessions = db.calls.filter((call) => call.operation.endsWith(":ITEMS")).map((c) => c.session);
      expect(sessions.every((used) => used === session)).toBe(true);
    });

    it("el repositorio original sigue trabajando fuera de la transacción", async () => {
      repository.withSession({ id: "sesion-1" } as unknown as ClientSession);
      await repository.getAll();

      expect(db.calls.at(-1)?.session).toBeUndefined();
    });
  });

  // =============================================================  bitácora  ==
  describe("bitácora", () => {
    let context: AsyncRequestContextPlugin;
    let tracked: MongoGenericRepository<ITestItem>;

    const entries = async () =>
      new MongoGenericRepository<IAuditLog>(db, AUDIT_LOG_ENTITY, silentLogger).getAll({
        orderBy: { field: "pkAudit" },
      });

    const asUser = <T>(name: string, fn: () => T): T =>
      context.run({ requestId: "req-42", user: { id: "7", name, email: null } }, fn);

    beforeEach(() => {
      context = new AsyncRequestContextPlugin();
      const trail = new MongoAuditTrail(
        new MongoGenericRepository<IAuditLog>(db, AUDIT_LOG_ENTITY, silentLogger, context)
      );
      tracked = new MongoGenericRepository<ITestItem>(db, TRACKED_ENTITY, silentLogger, context, trail);
    });

    it("registra cada escritura con quién la hizo y su petición", async () => {
      const created = await asUser("Ruben", () => tracked.insert({ name: "delta" }));
      await asUser("Ruben", () => tracked.update(created.pkItem, { name: "delta v2" }));
      await asUser("Ruben", () => tracked.softDelete(created.pkItem));
      await asUser("Ruben", () => tracked.restore(created.pkItem));
      await asUser("Ruben", () => tracked.hardDelete(created.pkItem));

      const lines = await entries();
      expect(lines.map((line) => line.action)).toEqual([
        "INSERT",
        "UPDATE",
        "SOFT_DELETE",
        "RESTORE",
        "HARD_DELETE",
      ]);
      expect(lines.every((line) => line.changedBy === "Ruben")).toBe(true);
      expect(lines.every((line) => line.requestId === "req-42")).toBe(true);
      expect(lines.every((line) => line.entity === "ITEMS")).toBe(true);
    });

    it("sin contexto de petición todo queda a nombre del sistema", async () => {
      await tracked.insert({ name: "delta" });

      expect((await entries())[0]).toMatchObject({ changedBy: "System", requestId: null });
    });

    it("guarda el estado previo y el posterior de una modificación", async () => {
      const created = await asUser("Ana", () => tracked.insert({ name: "delta" }));
      await asUser("Ana", () => tracked.update(created.pkItem, { name: "delta v2" }));

      const cambios = JSON.parse(String((await entries())[1].changes));
      expect(cambios.before.name).toBe("delta");
      expect(cambios.after.name).toBe("delta v2");
    });

    it("las operaciones masivas se registran una sola vez, con el alcance", async () => {
      await asUser("Ana", () => tracked.insertMany([{ name: "d" }, { name: "e" }]));
      await asUser("Ana", () => tracked.updateWhere({ qty: { gte: 0 } }, { tag: "z" }));
      await asUser("Ana", () => tracked.hardDeleteWhere({ name: "d" }));

      expect((await entries()).map((line) => line.action)).toEqual([
        "INSERT_MANY",
        "UPDATE_MANY",
        "HARD_DELETE_MANY",
      ]);
    });

    it("una entidad sin la bitácora activada no deja rastro", async () => {
      const trail = new MongoAuditTrail(
        new MongoGenericRepository<IAuditLog>(db, AUDIT_LOG_ENTITY, silentLogger)
      );
      const untracked = new MongoGenericRepository<ITestItem>(
        db,
        TEST_ENTITY,
        silentLogger,
        context,
        trail
      );

      await untracked.insert({ name: "delta" });

      expect(await entries()).toHaveLength(0);
    });

    it("bindTo ata también la bitácora a la sesión de la transacción", async () => {
      const session = { id: "sesion-1" } as unknown as ClientSession;

      await tracked.withSession(session).insert({ name: "delta" });

      // La línea de bitácora se escribe por la misma sesión: si la transacción
      // revierte, desaparece con ella.
      const escrituras = db.calls.filter((call) => call.operation === "insertOne:AUDIT_LOG");
      expect(escrituras).toHaveLength(1);
      expect(escrituras[0].session).toBe(session);
    });

    it("la reserva de PK queda fuera de la sesión, para no chocar entre transacciones", async () => {
      // Dos transacciones incrementando el mismo documento contador se
      // bloquearían entre sí; y una secuencia de Oracle tampoco devuelve el
      // número al hacer rollback, así que dejar hueco es lo esperado.
      const session = { id: "sesion-1" } as unknown as ClientSession;

      await tracked.withSession(session).insert({ name: "delta" });

      const contador = db.calls.filter((call) => call.operation.endsWith(":_counters"));
      expect(contador.length).toBeGreaterThan(0);
      expect(contador.every((call) => call.session === undefined)).toBe(true);
    });
  });
});
