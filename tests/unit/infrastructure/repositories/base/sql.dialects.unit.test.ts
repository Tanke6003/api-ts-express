import { oracleDialect, sqlServerDialect } from "../../../../../src/infrastructure/repositories/base/dialects/sql.dialect";
import { SqlGenericRepository } from "../../../../../src/infrastructure/repositories/base/drivers/sql.generic.repository";
import { FakeSqlExecutor, silentLogger } from "./fake-sql-executor";
import { ITestItem, IPlainItem, PLAIN_ENTITY, TEST_ENTITY } from "./test-entity";

const ROW = { PK_ITEM: 1, NAME: "alpha", QTY: 10, ACTIVE: 1 };

/**
 * SQL Server comparte toda la generación de SQL con Oracle: sólo cambian la
 * recuperación de la PK generada y la expresión de fecha del servidor. Estas
 * pruebas cubren justo esas diferencias.
 */
describe("SqlServerGenericRepository", () => {
  let db: FakeSqlExecutor;
  let repository: SqlGenericRepository<ITestItem>;

  beforeEach(() => {
    db = new FakeSqlExecutor();
    repository = new SqlGenericRepository<ITestItem>(
      db,
      TEST_ENTITY,
      silentLogger,
      sqlServerDialect
    );
  });

  describe("INSERT", () => {
    it("recupera la PK con OUTPUT INSERTED en vez de RETURNING", async () => {
      db.queue({ rows: [{ insertedId: 42 }] }).queue({ rows: [ROW] });

      await repository.insert({ name: "alpha", qty: 10 });

      expect(db.sqlAt(0)).toBe(
        "INSERT INTO ITEMS (NAME, QTY, CREATED_AT) OUTPUT INSERTED.PK_ITEM AS insertedId " +
          "VALUES (:b0, :b1, SYSDATETIME())"
      );
      // La sentencia devuelve filas, así que el executor debe leerlas.
      expect(db.calls[0].expects).toBe("rows");
      // Y la relectura usa la PK devuelta por OUTPUT.
      expect(db.calls[1].binds).toMatchObject({ w0: 42 });
    });

    it("tolera que el driver devuelva la columna en otra caja", async () => {
      db.queue({ rows: [{ INSERTEDID: 7 }] }).queue({ rows: [ROW] });

      await repository.insert({ name: "alpha" });

      expect(db.calls[1].binds).toMatchObject({ w0: 7 });
    });

    it("sin identity no añade OUTPUT y sólo cuenta filas afectadas", async () => {
      const plain = new SqlGenericRepository<IPlainItem, string>(
      db,
      PLAIN_ENTITY,
      silentLogger,
      sqlServerDialect
    );
      db.queue({ rowsAffected: 1 }).queue({ rows: [{ CODE: "A", LABEL: "uno" }] });

      await plain.insert({ code: "A", label: "uno" });

      expect(db.sqlAt(0)).toBe("INSERT INTO PLAIN (CODE, LABEL) VALUES (:b0, :b1)");
      expect(db.calls[0].expects).toBe("affected");
    });

    it("insertMany usa la fecha del servidor de SQL Server", async () => {
      await repository.insertMany([{ name: "a" }]);

      expect(db.sqlAt(0)).toContain("SYSDATETIME()");
      expect(db.sqlAt(0)).not.toContain("SYSTIMESTAMP");
    });
  });

  describe("resto del SQL", () => {
    it("el UPDATE sella la fecha con SYSDATETIME()", async () => {
      db.queue({ rowsAffected: 1 }).queue({ rows: [ROW] });
      await repository.update(1, { name: "nuevo" });

      expect(db.sqlAt(0)).toBe(
        "UPDATE ITEMS SET NAME = :s0, UPDATED_AT = SYSDATETIME() " +
          "WHERE (PK_ITEM = :w0 AND ACTIVE = :w1)"
      );
      expect(db.calls[0].expects).toBe("affected");
    });

    it("la paginación es idéntica a la de Oracle", async () => {
      await repository.find({ skip: 10, take: 5 });

      expect(db.lastSql).toContain(
        "ORDER BY PK_ITEM OFFSET :pgskip ROWS FETCH NEXT :pgtake ROWS ONLY"
      );
    });

    it("el filtro y la proyección se generan igual", async () => {
      await repository.find({ where: { qty: { gte: 5 } }, select: ["name"] });

      expect(db.lastSql).toBe("SELECT NAME FROM ITEMS WHERE (QTY >= :w0 AND ACTIVE = :w1)");
      expect(db.lastBinds).toEqual({ w0: 5, w1: 1 });
    });

    it("count lee el total aunque el driver devuelva la columna en minúsculas", async () => {
      db.queue({ rows: [{ total: 4 }] });
      expect(await repository.count()).toBe(4);
    });

    it("el borrado lógico sigue siendo idempotente", async () => {
      db.queue({ rowsAffected: 1 });
      expect(await repository.softDelete(1)).toBe(true);

      expect(db.lastSql).toBe(
        "UPDATE ITEMS SET ACTIVE = :flag, UPDATED_AT = SYSDATETIME() " +
          "WHERE PK_ITEM = :pk AND ACTIVE = :previous"
      );
      expect(db.lastBinds).toEqual({ flag: 0, pk: 1, previous: 1 });
    });

    it("el borrado físico pide filas afectadas", async () => {
      db.queue({ rowsAffected: 1 });
      await repository.hardDelete(1);

      expect(db.lastSql).toBe("DELETE FROM ITEMS WHERE PK_ITEM = :pk");
      expect(db.calls[0].expects).toBe("affected");
    });
  });

  it("withExecutor mantiene el dialecto de SQL Server", async () => {
    const tx = new FakeSqlExecutor();
    tx.queue({ rows: [{ insertedId: 1 }] }).queue({ rows: [ROW] });

    const bound = repository.withExecutor(tx);
    await bound.insert({ name: "x" });

    expect(bound).toBeInstanceOf(SqlGenericRepository);
    expect(tx.sqlAt(0)).toContain("OUTPUT INSERTED");
  });
});

describe("los dos dialectos sobre la misma entidad", () => {
  it("generan el mismo SELECT y difieren sólo donde deben", async () => {
    const oracleDb = new FakeSqlExecutor();
    const mssqlDb = new FakeSqlExecutor();

    await new SqlGenericRepository<ITestItem>(
      oracleDb,
      TEST_ENTITY,
      silentLogger,
      oracleDialect
    ).find({
      where: { name: "x" },
    });
    await new SqlGenericRepository<ITestItem>(
      mssqlDb,
      TEST_ENTITY,
      silentLogger,
      sqlServerDialect
    ).find({
      where: { name: "x" },
    });

    expect(mssqlDb.lastSql).toBe(oracleDb.lastSql);
  });
});
