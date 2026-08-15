import { BaseModuleRepository } from "../../../../src/infrastructure/repositories/base/module.repository";
import { MemoryGenericRepository } from "../../../../src/infrastructure/repositories/base/drivers/memory.generic.repository";
import {
  ITestItem,
  SEED,
  TEST_ENTITY,
} from "./base/test-entity";

class ItemsRepository extends BaseModuleRepository<ITestItem> {
  constructor(store: never, logger: never) {
    super(store, logger, "ItemsRepository");
  }
}

describe("BaseModuleRepository", () => {
  let store: MemoryGenericRepository<ITestItem>;
  let logger: any;
  let repository: ItemsRepository;

  beforeEach(() => {
    store = new MemoryGenericRepository<ITestItem>(TEST_ENTITY, SEED);
    logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    repository = new ItemsRepository(store as never, logger as never);
  });

  it("delega todas las operaciones del repositorio genérico", async () => {
    expect(await repository.getAll()).toHaveLength(3);
    expect(await repository.find({ where: { qty: 10 } })).toHaveLength(1);
    expect(await repository.firstOrDefault({ where: { qty: 10 } })).toMatchObject({ qty: 10 });
    expect(await repository.getById(1)).toMatchObject({ pkItem: 1 });
    expect(await repository.count()).toBe(3);
    expect(await repository.exists({ qty: 10 })).toBe(true);
    expect(await repository.getPaged(1, 2)).toMatchObject({ total: 3, pages: 2 });

    expect(await repository.insert({ name: "delta" })).toMatchObject({ name: "delta" });
    expect(await repository.insertMany([{ name: "e" }])).toBe(1);
    expect(await repository.update(1, { name: "alpha2" })).toMatchObject({ name: "alpha2" });
    expect(await repository.updateWhere({ qty: 10 }, { tag: "z" })).toBe(1);

    expect(await repository.softDelete(1)).toBe(true);
    expect(await repository.restore(1)).toBe(true);
    expect(await repository.hardDelete(1)).toBe(true);
    expect(await repository.hardDeleteWhere({ qty: 20 })).toBe(1);
  });

  it("traduce cualquier fallo del almacén a un error genérico y lo registra", async () => {
    jest.spyOn(store, "getAll").mockRejectedValue(new Error("ORA-00942: table or view does not exist"));

    // Hacia arriba no se filtra el detalle del driver...
    await expect(repository.getAll()).rejects.toThrow("ItemsRepository.getAll failed.");
    // ...pero sí queda en el log, que es donde sirve para diagnosticar.
    expect(logger.error).toHaveBeenCalledWith(
      "Error in ItemsRepository.getAll",
      expect.objectContaining({ error: expect.any(Error) })
    );
  });

  it("query() encadena sobre el propio repositorio, así que también pasa por el guard", async () => {
    expect(await repository.query().where({ qty: { gte: 20 } }).count()).toBe(2);

    jest.spyOn(store, "count").mockRejectedValue(new Error("boom"));
    await expect(repository.query().count()).rejects.toThrow("ItemsRepository.count failed.");
  });
});
