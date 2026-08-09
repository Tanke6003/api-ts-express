import { QueryBuilder } from "../../../../../src/infrastructure/repositories/base/query-builder";
import { ITestItem } from "./test-entity";

describe("QueryBuilder", () => {
  let repository: any;
  let query: QueryBuilder<ITestItem>;

  beforeEach(() => {
    repository = {
      find: jest.fn().mockResolvedValue([]),
      firstOrDefault: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(0),
      getPaged: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 10, pages: 0 }),
    };
    query = new QueryBuilder<ITestItem>(repository);
  });

  it("es inmutable: cada operador devuelve una consulta nueva", () => {
    const filtered = query.where({ qty: 1 });

    expect(filtered).not.toBe(query);
    expect(query.toOptions()).toEqual({});
    expect(filtered.toOptions().where).toEqual({ qty: 1 });
  });

  it("varios where se combinan con AND", () => {
    const options = query.where({ qty: 1 }).where({ name: "a" }).toOptions();

    expect(options.where).toEqual({ $and: [{ qty: 1 }, { name: "a" }] });
  });

  it("acumula los criterios de orden en el orden en que se piden", () => {
    const options = query.orderBy("qty").orderByDescending("name").toOptions();

    expect(options.orderBy).toEqual([
      { field: "qty", direction: "asc" },
      { field: "name", direction: "desc" },
    ]);
  });

  it("select, skip, take y withDeleted quedan en las opciones", () => {
    const options = query.select("name", "qty").skip(5).take(2).withDeleted().toOptions();

    expect(options).toMatchObject({
      select: ["name", "qty"],
      skip: 5,
      take: 2,
      withDeleted: true,
    });
  });

  it("toList delega en find con las opciones acumuladas", async () => {
    await query.where({ qty: 1 }).take(3).toList();

    expect(repository.find).toHaveBeenCalledWith({ where: { qty: 1 }, take: 3 });
  });

  it("firstOrDefault delega en el repositorio", async () => {
    await query.where({ qty: 1 }).firstOrDefault();

    expect(repository.firstOrDefault).toHaveBeenCalledWith({ where: { qty: 1 } });
  });

  it("count pasa filtro y withDeleted", async () => {
    await query.where({ qty: 1 }).withDeleted().count();

    expect(repository.count).toHaveBeenCalledWith({ qty: 1 }, true);
  });

  it("any es true en cuanto hay una fila", async () => {
    repository.count.mockResolvedValue(0);
    expect(await query.any()).toBe(false);

    repository.count.mockResolvedValue(2);
    expect(await query.any()).toBe(true);
  });

  it("toPagedList ignora skip/take previos porque los fija la paginación", async () => {
    await query.where({ qty: 1 }).skip(99).take(99).orderBy("name").toPagedList(2, 5);

    expect(repository.getPaged).toHaveBeenCalledWith(2, 5, {
      where: { qty: 1 },
      orderBy: [{ field: "name", direction: "asc" }],
      select: undefined,
      withDeleted: undefined,
    });
  });

  it("toOptions devuelve una copia", () => {
    const built = query.where({ qty: 1 });
    const options = built.toOptions();
    options.take = 100;

    expect(built.toOptions().take).toBeUndefined();
  });
});
