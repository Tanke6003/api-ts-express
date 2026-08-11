import { MemoryGenericRepository } from "../../../../../src/infrastructure/repositories/base/drivers/memory.generic.repository";
import { MemoryUnitOfWork } from "../../../../../src/infrastructure/repositories/base/unit-of-work/memory.unit-of-work";
import { OracleGenericRepository } from "../../../../../src/infrastructure/repositories/base/drivers/oracle.generic.repository";
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
});

describe("SqlUnitOfWork", () => {
  let executor: FakeSqlExecutor;
  let transactionExecutor: FakeSqlExecutor;
  let repository: OracleGenericRepository<ITestItem>;
  let db: any;
  let unitOfWork: SqlUnitOfWork;

  beforeEach(() => {
    executor = new FakeSqlExecutor();
    transactionExecutor = new FakeSqlExecutor();
    repository = new OracleGenericRepository<ITestItem>(executor, TEST_ENTITY, silentLogger);

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
});
