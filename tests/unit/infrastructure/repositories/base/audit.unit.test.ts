import { oracleDialect } from "../../../../../src/infrastructure/repositories/base/dialects/sql.dialect";
import { SqlGenericRepository } from "../../../../../src/infrastructure/repositories/base/drivers/sql.generic.repository";
import { MemoryGenericRepository } from "../../../../../src/infrastructure/repositories/base/drivers/memory.generic.repository";
import { AsyncRequestContextPlugin } from "../../../../../src/infrastructure/plugins/asyncRequestContext.plugin";
import type { IRequestContext } from "../../../../../src/domain/interfaces/infrastructure/plugins/request-context.plugin.interface";
import { FakeSqlExecutor, silentLogger } from "./fake-sql-executor";
import { AUDITED_ENTITY, AUDITED_SOFT_ENTITY, IAuditedItem } from "./test-entity";

/** Ejecuta `fn` como si la petición viniera de ese usuario. */
function asUser<T>(context: IRequestContext, name: string, fn: () => T): T {
  return context.run({ requestId: "req-1", user: { id: "7", name, email: null } }, fn);
}

describe("auditoría de usuario en el repositorio genérico", () => {
  let context: AsyncRequestContextPlugin;

  beforeEach(() => {
    context = new AsyncRequestContextPlugin();
  });

  // ==============================================================  memoria  ==
  describe("MemoryGenericRepository", () => {
    let repository: MemoryGenericRepository<IAuditedItem>;

    beforeEach(() => {
      repository = new MemoryGenericRepository<IAuditedItem>(AUDITED_ENTITY, [], context);
    });

    it("sella createdBy con el usuario de la petición", async () => {
      const created = await asUser(context, "Ruben", () => repository.insert({ name: "uno" }));

      expect(created.createdBy).toBe("Ruben");
      expect(created.updatedBy).toBeNull();
    });

    it("fuera de una petición escribe System", async () => {
      expect((await repository.insert({ name: "seed" })).createdBy).toBe("System");
    });

    it("sin contexto inyectado también escribe System", async () => {
      const orphan = new MemoryGenericRepository<IAuditedItem>(AUDITED_ENTITY, []);
      expect((await orphan.insert({ name: "x" })).createdBy).toBe("System");
    });

    it("sella updatedBy al actualizar, sin tocar createdBy", async () => {
      const created = await asUser(context, "Ana", () => repository.insert({ name: "uno" }));
      const updated = await asUser(context, "Beto", () =>
        repository.update(created.pkItem, { name: "dos" })
      );

      expect(updated).toMatchObject({ createdBy: "Ana", updatedBy: "Beto" });
    });

    // El cliente no debe poder decidir quién figura como autor.
    it("ignora la auditoría que venga en el cuerpo de la petición", async () => {
      const created = await asUser(context, "Ana", () =>
        repository.insert({ name: "uno", createdBy: "Suplantador" })
      );
      expect(created.createdBy).toBe("Ana");

      const updated = await asUser(context, "Ana", () =>
        repository.update(created.pkItem, { name: "dos", updatedBy: "Suplantador" })
      );
      expect(updated?.updatedBy).toBe("Ana");
    });

    it("el borrado lógico también deja rastro de quién lo hizo", async () => {
      const soft = new MemoryGenericRepository<IAuditedItem & { active?: boolean }>(
        AUDITED_SOFT_ENTITY,
        [],
        context
      );
      const created = await asUser(context, "Ana", () => soft.insert({ name: "uno" }));

      await asUser(context, "Beto", () => soft.softDelete(created.pkItem));

      expect(await soft.getById(created.pkItem, { withDeleted: true })).toMatchObject({
        updatedBy: "Beto",
      });
    });

    it("mantiene el usuario a través de operaciones asíncronas encadenadas", async () => {
      const created = await asUser(context, "Ruben", async () => {
        await Promise.resolve();
        return repository.insert({ name: "tras await" });
      });

      expect(created.createdBy).toBe("Ruben");
    });
  });

  // ===============================================================  Oracle  ==
  describe("OracleGenericRepository", () => {
    let db: FakeSqlExecutor;
    let repository: SqlGenericRepository<IAuditedItem>;

    beforeEach(() => {
      db = new FakeSqlExecutor();
      repository = new SqlGenericRepository<IAuditedItem>(
      db,
      AUDITED_ENTITY,
      silentLogger,
      oracleDialect,
      context
    );
    });

    it("añade CREATED_BY al INSERT como bind", async () => {
      db.queue({ outBinds: { insertedId: [1] } }).queue({ rows: [{ PK_ITEM: 1, NAME: "uno" }] });

      await asUser(context, "Ruben", () => repository.insert({ name: "uno" }));

      expect(db.sqlAt(0)).toBe(
        "INSERT INTO AUDITED (NAME, CREATED_BY) VALUES (:b0, :auditUser) RETURNING PK_ITEM INTO :insertedId"
      );
      expect(db.calls[0].binds).toMatchObject({ auditUser: "Ruben" });
    });

    it("añade UPDATED_BY al UPDATE", async () => {
      db.queue({ rowsAffected: 1 }).queue({ rows: [{ PK_ITEM: 1 }] });

      await asUser(context, "Beto", () => repository.update(1, { name: "dos" }));

      expect(db.sqlAt(0)).toContain("UPDATED_BY = :auditUser");
      expect(db.calls[0].binds).toMatchObject({ auditUser: "Beto" });
    });

    it("insertMany reparte el mismo usuario en todas las filas", async () => {
      await asUser(context, "Ruben", () =>
        repository.insertMany([{ name: "a" }, { name: "b" }])
      );

      expect(db.sqlAt(0)).toBe(
        "INSERT INTO AUDITED (NAME, CREATED_BY) VALUES (:b0, :auditUser)"
      );
      expect(db.calls[0].binds).toEqual([
        { b0: "a", auditUser: "Ruben" },
        { b0: "b", auditUser: "Ruben" },
      ]);
    });

    it("el borrado lógico registra quién lo hizo", async () => {
      const soft = new SqlGenericRepository<IAuditedItem & { active?: boolean }>(
      db,
      AUDITED_SOFT_ENTITY,
      silentLogger,
      oracleDialect,
      context
    );
      db.queue({ rowsAffected: 1 });

      await asUser(context, "Beto", () => soft.softDelete(1));

      expect(db.lastSql).toContain("UPDATED_BY = :auditUser");
      expect(db.lastBinds).toMatchObject({ auditUser: "Beto" });
    });

    it("withExecutor conserva el contexto dentro de la transacción", async () => {
      const tx = new FakeSqlExecutor();
      tx.queue({ outBinds: { insertedId: [1] } }).queue({ rows: [{ PK_ITEM: 1 }] });

      await asUser(context, "Ruben", () => repository.withExecutor(tx).insert({ name: "uno" }));

      expect(tx.calls[0].binds).toMatchObject({ auditUser: "Ruben" });
    });

    it("sin petición en curso escribe System", async () => {
      db.queue({ outBinds: { insertedId: [1] } }).queue({ rows: [{ PK_ITEM: 1 }] });

      await repository.insert({ name: "seed" });

      expect(db.calls[0].binds).toMatchObject({ auditUser: "System" });
    });
  });
});
