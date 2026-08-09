import { OracleGenericRepository } from "../../../../../src/infrastructure/repositories/base/oracle.generic.repository";
import { FakeSqlExecutor, silentLogger } from "./fake-sql-executor";
import { ITestItem, IPlainItem, PLAIN_ENTITY, TEST_ENTITY } from "./test-entity";

const ROW = {
  PK_ITEM: 1,
  NAME: "alpha",
  QTY: 10,
  TAG: null,
  FLAG: 1,
  DUE_AT: new Date("2026-01-10T10:00:00Z"),
  ACTIVE: 1,
  CREATED_AT: new Date("2026-01-01T00:00:00Z"),
  UPDATED_AT: null,
};

describe("OracleGenericRepository", () => {
  let db: FakeSqlExecutor;
  let repository: OracleGenericRepository<ITestItem>;

  beforeEach(() => {
    db = new FakeSqlExecutor();
    repository = new OracleGenericRepository<ITestItem>(db, TEST_ENTITY, silentLogger);
  });

  // ============================================================  lectura  ===
  describe("SELECT", () => {
    it("lista todas las columnas mapeadas y excluye lo borrado lógicamente", async () => {
      await repository.getAll();

      expect(db.lastSql).toContain("SELECT PK_ITEM, NAME, QTY, TAG, FLAG, DUE_AT, ACTIVE");
      expect(db.lastSql).toContain("FROM ITEMS");
      expect(db.lastSql).toContain("WHERE ACTIVE = :w0");
      expect(db.lastBinds).toEqual({ w0: 1 });
    });

    it("withDeleted quita el filtro de borrado lógico", async () => {
      await repository.getAll({ withDeleted: true });
      expect(db.lastSql).not.toContain("WHERE");
    });

    it("proyecta sólo lo pedido", async () => {
      await repository.find({ select: ["name", "qty"] });
      expect(db.lastSql).toContain("SELECT NAME, QTY FROM ITEMS");
    });

    it("traduce el orden", async () => {
      await repository.find({
        orderBy: [{ field: "qty", direction: "desc" }, { field: "name" }],
      });
      expect(db.lastSql).toContain("ORDER BY QTY DESC, NAME ASC");
    });

    it("pagina con OFFSET/FETCH y ordena por PK si no se pidió orden", async () => {
      await repository.find({ skip: 20, take: 10 });

      expect(db.lastSql).toContain("ORDER BY PK_ITEM OFFSET :pgskip ROWS FETCH NEXT :pgtake ROWS ONLY");
      expect(db.lastBinds).toMatchObject({ pgskip: 20, pgtake: 10 });
    });

    it("mapea la fila cruda a la entidad, convirtiendo tipos", async () => {
      db.queue({ rows: [ROW] });
      const item = await repository.getById(1);

      expect(item).toMatchObject({ pkItem: 1, name: "alpha", qty: 10, tag: null, flag: true });
      expect(item?.createdAt).toBeInstanceOf(Date);
    });

    it("getById filtra por PK y limita a una fila", async () => {
      await repository.getById(7);

      expect(db.lastSql).toContain("PK_ITEM = :w0");
      expect(db.lastBinds).toMatchObject({ w0: 7, pgtake: 1 });
    });

    it("count usa COUNT(*) y devuelve 0 si no hay filas", async () => {
      db.queue({ rows: [{ TOTAL: 5 }] });
      expect(await repository.count()).toBe(5);
      expect(db.lastSql).toContain("SELECT COUNT(*) AS TOTAL FROM ITEMS");

      expect(await repository.count()).toBe(0);
    });

    it("exists se apoya en count", async () => {
      db.queue({ rows: [{ TOTAL: 1 }] });
      expect(await repository.exists({ name: "alpha" })).toBe(true);
    });

    it("getPaged combina el conteo y la página", async () => {
      db.queue({ rows: [{ TOTAL: 3 }] }).queue({ rows: [ROW] });
      const page = await repository.getPaged(2, 2);

      expect(page).toMatchObject({ total: 3, page: 2, limit: 2, pages: 2 });
      expect(page.items).toHaveLength(1);
      expect(db.lastBinds).toMatchObject({ pgskip: 2, pgtake: 2 });
    });
  });

  // ==========================================================  escritura  ===
  describe("INSERT", () => {
    it("escribe columnas, deja la fecha a la base y recupera la PK", async () => {
      db.queue({ rowsAffected: 1, outBinds: { insertedId: [42] } }).queue({ rows: [ROW] });

      const created = await repository.insert({ name: "alpha", qty: 10 });

      expect(db.sqlAt(0)).toBe(
        "INSERT INTO ITEMS (NAME, QTY, CREATED_AT) VALUES (:b0, :b1, SYSTIMESTAMP) " +
          "RETURNING PK_ITEM INTO :insertedId"
      );
      expect(db.calls[0].binds).toMatchObject({ b0: "alpha", b1: 10 });
      // La relectura usa la PK devuelta por RETURNING.
      expect(db.calls[1].binds).toMatchObject({ w0: 42 });
      expect(created.name).toBe("alpha");
    });

    it("convierte los booleanos a 1/0", async () => {
      db.queue({ outBinds: { insertedId: [1] } }).queue({ rows: [ROW] });
      await repository.insert({ name: "x", flag: false });

      expect(db.calls[0].binds).toMatchObject({ b1: 0 });
    });

    it("lanza si no hay ninguna columna que escribir", async () => {
      await expect(repository.insert({})).rejects.toThrow(/sin columnas que escribir/);
    });

    it("lanza si la fila insertada no se puede releer", async () => {
      db.queue({ outBinds: { insertedId: [42] } }).queue({ rows: [] });
      await expect(repository.insert({ name: "x" })).rejects.toThrow(/no se pudo releer/);
    });

    it("sin identity usa la PK provista y no genera RETURNING", async () => {
      const plain = new OracleGenericRepository<IPlainItem, string>(
        db,
        PLAIN_ENTITY,
        silentLogger
      );
      db.queue({ rowsAffected: 1 }).queue({ rows: [{ CODE: "A", LABEL: "uno" }] });

      const created = await plain.insert({ code: "A", label: "uno" });

      expect(db.sqlAt(0)).toBe("INSERT INTO PLAIN (CODE, LABEL) VALUES (:b0, :b1)");
      expect(created.code).toBe("A");
    });

    it("insertMany usa una sola sentencia con un juego de binds por fila", async () => {
      const affected = await repository.insertMany([
        { name: "a", qty: 1 },
        { name: "b" },
      ]);

      expect(affected).toBe(2);
      expect(db.sqlAt(0)).toBe(
        "INSERT INTO ITEMS (NAME, QTY, CREATED_AT) VALUES (:b0, :b1, SYSTIMESTAMP)"
      );
      expect(db.calls[0].binds).toEqual([
        { b0: "a", b1: 1 },
        // La fila que no trae la columna viaja como NULL.
        { b0: "b", b1: null },
      ]);
    });

    it("insertMany con lista vacía no toca la base", async () => {
      expect(await repository.insertMany([])).toBe(0);
      expect(db.calls).toHaveLength(0);
    });

    it("insertMany lanza si ninguna fila aporta columnas", async () => {
      await expect(repository.insertMany([{}])).rejects.toThrow(/sin columnas que escribir/);
    });
  });

  describe("UPDATE", () => {
    it("actualiza sólo lo recibido y sella updatedAt", async () => {
      db.queue({ rowsAffected: 1 }).queue({ rows: [ROW] });
      await repository.update(1, { name: "nuevo" });

      expect(db.sqlAt(0)).toBe(
        "UPDATE ITEMS SET NAME = :s0, UPDATED_AT = SYSTIMESTAMP WHERE (PK_ITEM = :w0 AND ACTIVE = :w1)"
      );
      expect(db.calls[0].binds).toMatchObject({ s0: "nuevo", w0: 1, w1: 1 });
    });

    it("un update sin cambios efectivos devuelve el estado actual sin escribir", async () => {
      db.queue({ rows: [ROW] });
      const result = await repository.update(1, { pkItem: 9 });

      expect(result?.pkItem).toBe(1);
      expect(db.lastSql.startsWith("SELECT")).toBe(true);
    });

    it("devuelve null si el UPDATE no afectó a nadie", async () => {
      db.queue({ rowsAffected: 0 });
      expect(await repository.update(1, { name: "x" })).toBeNull();
    });

    it("updateWhere devuelve las filas afectadas", async () => {
      db.queue({ rowsAffected: 3 });
      expect(await repository.updateWhere({ qty: { gt: 5 } }, { tag: "z" })).toBe(3);
      expect(await repository.updateWhere({ qty: { gt: 5 } }, {})).toBe(0);
    });
  });

  // ============================================================  borrado  ===
  describe("DELETE", () => {
    it("el borrado lógico exige el estado previo, así que es idempotente", async () => {
      db.queue({ rowsAffected: 1 });
      expect(await repository.softDelete(1)).toBe(true);

      expect(db.lastSql).toBe(
        "UPDATE ITEMS SET ACTIVE = :flag, UPDATED_AT = SYSTIMESTAMP " +
          "WHERE PK_ITEM = :pk AND ACTIVE = :previous"
      );
      expect(db.lastBinds).toEqual({ flag: 0, pk: 1, previous: 1 });
    });

    it("restore invierte los valores del borrado lógico", async () => {
      db.queue({ rowsAffected: 1 });
      expect(await repository.restore(1)).toBe(true);
      expect(db.lastBinds).toEqual({ flag: 1, pk: 1, previous: 0 });
    });

    it("el borrado físico emite un DELETE", async () => {
      db.queue({ rowsAffected: 1 });
      expect(await repository.hardDelete(1)).toBe(true);
      expect(db.lastSql).toBe("DELETE FROM ITEMS WHERE PK_ITEM = :pk");

      expect(await repository.hardDelete(1)).toBe(false);
    });

    it("hardDeleteWhere no aplica el filtro de borrado lógico", async () => {
      db.queue({ rowsAffected: 2 });
      expect(await repository.hardDeleteWhere({ qty: { lt: 5 } })).toBe(2);

      expect(db.lastSql).toBe("DELETE FROM ITEMS WHERE QTY < :w0");
      expect(db.lastSql).not.toContain("ACTIVE");
    });

    it("lanza si la entidad no declara borrado lógico", async () => {
      const plain = new OracleGenericRepository<IPlainItem, string>(db, PLAIN_ENTITY, silentLogger);
      await expect(plain.softDelete("A")).rejects.toThrow(/no declara softDelete/);
    });
  });

  // ==============================================================  extras  ==
  it("executeRaw pasa el SQL tal cual con sus binds", async () => {
    db.queue({ rows: [{ TOTAL: 2 }] });
    const rows = await repository.executeRaw("SELECT COUNT(*) AS TOTAL FROM ITEMS", { a: 1 });

    expect(rows).toEqual([{ TOTAL: 2 }]);
    expect(db.lastBinds).toEqual({ a: 1 });
  });

  it("withExecutor clona el repositorio contra otra conexión", async () => {
    const other = new FakeSqlExecutor();
    await repository.withExecutor(other).getAll();

    expect(other.calls).toHaveLength(1);
    expect(db.calls).toHaveLength(0);
  });

  it("query() encadena filtros, orden y paginación", async () => {
    db.queue({ rows: [ROW] });

    await repository
      .query()
      .where({ qty: { gte: 10 } })
      .where({ flag: true })
      .orderByDescending("qty")
      .skip(5)
      .take(5)
      .toList();

    expect(db.lastSql).toContain("QTY >= :w0");
    expect(db.lastSql).toContain("FLAG = :w1");
    expect(db.lastSql).toContain("ORDER BY QTY DESC");
    expect(db.lastBinds).toMatchObject({ pgskip: 5, pgtake: 5 });
  });
});
