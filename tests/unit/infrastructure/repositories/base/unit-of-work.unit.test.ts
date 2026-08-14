import { oracleDialect } from "../../../../../src/infrastructure/repositories/base/dialects/sql.dialect";
import { SqlGenericRepository } from "../../../../../src/infrastructure/repositories/base/drivers/sql.generic.repository";
import { MemoryGenericRepository } from "../../../../../src/infrastructure/repositories/base/drivers/memory.generic.repository";
import { MemoryUnitOfWork } from "../../../../../src/infrastructure/repositories/base/unit-of-work/memory.unit-of-work";
import { SqlUnitOfWork } from "../../../../../src/infrastructure/repositories/base/unit-of-work/sql.unit-of-work";
import { FakeSqlExecutor, silentLogger } from "./fake-sql-executor";
import { ITestItem, SEED, TEST_ENTITY } from "./test-entity";

describe("MemoryUnitOfWork", () => {
  let store: MemoryGenericRepository<ITestItem>;
  let unitOfWork: MemoryUnitOfWork;

  beforeEach(() => {
    store = new MemoryGenericRepository<ITestItem>(TEST_ENTITY, SEED);
    unitOfWork = new MemoryUnitOfWork(new Map([["ITEMS", store as never]]));
  });

  it("confirma los cambios cuando el bloque termina bien", async () => {
    const result = await unitOfWork.execute(async (scope) => {
      await scope.repository<ITestItem>("ITEMS").hardDeleteWhere({ qty: { lte: 10 } });
      return "listo";
    });

    expect(result).toBe("listo");
    expect(await store.count()).toBe(2);
  });

  it("revierte todo si el bloque lanza", async () => {
    await expect(
      unitOfWork.execute(async (scope) => {
        const items = scope.repository<ITestItem>("ITEMS");
        await items.hardDeleteWhere({});
        expect(await items.count()).toBe(0);
        throw new Error("fallo a mitad");
      })
    ).rejects.toThrow("fallo a mitad");

    // El estado vuelve a como estaba antes de empezar.
    expect(await store.count()).toBe(3);
    expect((await store.getAll({ orderBy: { field: "pkItem" } })).map((i) => i.name)).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
  });

  it("lanza un error claro si se pide una entidad no registrada", async () => {
    await expect(
      unitOfWork.execute(async (scope) => scope.repository("DESCONOCIDA"))
    ).rejects.toThrow(/no está registrada en la unidad de trabajo/);
  });

  describe("aislamiento", () => {
    it("lockRow dice si la fila existe", async () => {
      await unitOfWork.execute(async (scope) => {
        expect(await scope.lockRow("ITEMS", 1)).toBe(true);
        expect(await scope.lockRow("ITEMS", 999)).toBe(false);
      });
    });

    it("no entrelaza dos transacciones: la segunda ve lo que confirmó la primera", async () => {
      const observed: number[] = [];

      // Cada bloque lee, cede el control al bucle de eventos y escribe. Sin
      // exclusión las dos leerían 3 y las dos insertarían: es exactamente la
      // forma de la carrera de "comprobar y luego escribir".
      const transaction = () =>
        unitOfWork.execute(async (scope) => {
          const items = scope.repository<ITestItem>("ITEMS");
          const before = await items.count();
          observed.push(before);

          await new Promise((resolve) => setImmediate(resolve));
          await items.insert({ name: `item-${before}`, qty: 1 });
        });

      await Promise.all([transaction(), transaction(), transaction()]);

      // Cada una arrancó con lo que dejó la anterior, no con la misma foto.
      expect(observed).toEqual([3, 4, 5]);
      expect(await store.count()).toBe(6);
    });

    it("una transacción que falla no revierte lo que otra ya había confirmado", async () => {
      await unitOfWork.execute(async (scope) => {
        await scope.repository<ITestItem>("ITEMS").insert({ name: "confirmada", qty: 1 });
      });

      await expect(
        unitOfWork.execute(async (scope) => {
          await scope.repository<ITestItem>("ITEMS").insert({ name: "revertida", qty: 1 });
          throw new Error("fallo");
        })
      ).rejects.toThrow("fallo");

      const names = (await store.getAll()).map((item) => item.name);
      expect(names).toContain("confirmada");
      expect(names).not.toContain("revertida");
    });

    it("un fallo no rompe la cola: la siguiente transacción sigue corriendo", async () => {
      await expect(unitOfWork.execute(async () => Promise.reject(new Error("boom")))).rejects.toThrow(
        "boom"
      );

      await expect(unitOfWork.execute(async () => "sigue viva")).resolves.toBe("sigue viva");
    });
  });
});

describe("SqlUnitOfWork", () => {
  let executor: FakeSqlExecutor;
  let transactionExecutor: FakeSqlExecutor;
  let repository: SqlGenericRepository<ITestItem>;
  let db: any;
  let unitOfWork: SqlUnitOfWork;

  beforeEach(() => {
    executor = new FakeSqlExecutor();
    transactionExecutor = new FakeSqlExecutor();
    repository = new SqlGenericRepository<ITestItem>(
      executor,
      TEST_ENTITY,
      silentLogger,
      oracleDialect
    );

    // Sustituto del pool: entrega el contexto de transacción al bloque.
    db = { transaction: jest.fn((work: any) => work(transactionExecutor)) };

    unitOfWork = new SqlUnitOfWork(db, new Map([["ITEMS", repository as never]]));
  });

  it("ejecuta el bloque dentro de una transacción del driver", async () => {
    const result = await unitOfWork.execute(async () => "ok");

    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(result).toBe("ok");
  });

  it("el repositorio del scope escribe por la conexión de la transacción", async () => {
    transactionExecutor.queue({ rowsAffected: 1 });

    await unitOfWork.execute(async (scope) => {
      await scope.repository<ITestItem>("ITEMS").hardDelete(1);
    });

    expect(transactionExecutor.calls).toHaveLength(1);
    // Nada se ha ido por el pool con auto-commit.
    expect(executor.calls).toHaveLength(0);
  });

  it("devuelve la misma instancia al pedir dos veces la misma entidad", async () => {
    await unitOfWork.execute(async (scope) => {
      expect(scope.repository("ITEMS")).toBe(scope.repository("ITEMS"));
    });
  });

  it("lanza un error claro si la entidad no está registrada", async () => {
    await expect(
      unitOfWork.execute(async (scope) => scope.repository("DESCONOCIDA"))
    ).rejects.toThrow(/no está registrada en la unidad de trabajo/);
  });

  it("propaga el error del bloque para que el driver haga rollback", async () => {
    await expect(
      unitOfWork.execute(async () => {
        throw new Error("fallo");
      })
    ).rejects.toThrow("fallo");
  });

  describe("lockRow", () => {
    it("bloquea la fila por la conexión de la transacción, no por el pool", async () => {
      transactionExecutor.queue({ rows: [{ PK_ITEM: 1 }] });

      const locked = await unitOfWork.execute((scope) => scope.lockRow("ITEMS", 1));

      expect(locked).toBe(true);
      expect(executor.calls).toHaveLength(0);

      const [call] = transactionExecutor.calls;
      expect(call.sql).toBe("SELECT PK_ITEM FROM ITEMS WHERE PK_ITEM = :pk FOR UPDATE");
      expect(call.binds).toEqual({ pk: 1 });
    });

    it("devuelve false si la fila no existe", async () => {
      transactionExecutor.queue({ rows: [] });

      await expect(unitOfWork.execute((scope) => scope.lockRow("ITEMS", 99))).resolves.toBe(false);
    });
  });
});
