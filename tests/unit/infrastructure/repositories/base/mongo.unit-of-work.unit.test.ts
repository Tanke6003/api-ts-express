import type { ClientSession } from "mongodb";
import { MongoGenericRepository } from "../../../../../src/infrastructure/repositories/base/drivers/mongo.generic.repository";
import { MongoUnitOfWork } from "../../../../../src/infrastructure/repositories/base/unit-of-work/mongo.unit-of-work";
import type { IMongoTransactionRunner } from "../../../../../src/infrastructure/repositories/base/unit-of-work/mongo.unit-of-work";
import { FakeMongoDataSource } from "./fake-mongo";
import { silentLogger } from "./fake-sql-executor";
import { ITestItem, TEST_ENTITY } from "./test-entity";

/**
 * Conector de mentira: entrega una sesión y deja constancia de si el bloque
 * terminó bien. Basta para comprobar lo que hace la unidad de trabajo, que es
 * repartir repositorios atados a esa sesión.
 */
class FakeTransactionRunner implements IMongoTransactionRunner {
  readonly session = { id: "sesion-1" } as unknown as ClientSession;
  started = 0;

  async transaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
    this.started += 1;
    return work(this.session);
  }
}

describe("MongoUnitOfWork", () => {
  let db: FakeMongoDataSource;
  let runner: FakeTransactionRunner;
  let store: MongoGenericRepository<ITestItem>;
  let unitOfWork: MongoUnitOfWork;

  beforeEach(() => {
    db = new FakeMongoDataSource();
    db.collectionOf("ITEMS").seed([
      { PK_ITEM: 1, NAME: "alpha", QTY: 10, ACTIVE: 1 },
      { PK_ITEM: 2, NAME: "beta", QTY: 20, ACTIVE: 1 },
    ]);

    runner = new FakeTransactionRunner();
    store = new MongoGenericRepository<ITestItem>(db, TEST_ENTITY, silentLogger);
    unitOfWork = new MongoUnitOfWork(runner, new Map([["ITEMS", store as never]]));
  });

  it("abre una transacción y devuelve lo que produce el bloque", async () => {
    const result = await unitOfWork.execute(async (scope) => {
      await scope.repository<ITestItem>("ITEMS").hardDeleteWhere({ qty: { lte: 10 } });
      return "listo";
    });

    expect(result).toBe("listo");
    expect(runner.started).toBe(1);
    expect(await store.count()).toBe(1);
  });

  it("entrega los repositorios atados a la sesión de la transacción", async () => {
    await unitOfWork.execute(async (scope) => {
      await scope.repository<ITestItem>("ITEMS").getAll();
    });

    expect(db.calls.at(-1)?.session).toBe(runner.session);
  });

  it("memoiza por entidad: dos peticiones devuelven la misma instancia", async () => {
    await unitOfWork.execute(async (scope) => {
      expect(scope.repository("ITEMS")).toBe(scope.repository("ITEMS"));
    });
  });

  it("lanza un error claro si se pide una entidad no registrada", async () => {
    await expect(
      unitOfWork.execute(async (scope) => scope.repository("DESCONOCIDA"))
    ).rejects.toThrow(/no está registrada en la unidad de trabajo/);
  });

  it("propaga el error del bloque tal cual, para que lo decida el servicio", async () => {
    await expect(
      unitOfWork.execute(async () => {
        throw new Error("fallo a mitad");
      })
    ).rejects.toThrow("fallo a mitad");
  });
});
