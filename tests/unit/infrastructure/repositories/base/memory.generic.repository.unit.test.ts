import { MemoryGenericRepository } from "../../../../../src/infrastructure/repositories/base/drivers/memory.generic.repository";
import { ITestItem, PLAIN_ENTITY, SEED, TEST_ENTITY, IPlainItem } from "./test-entity";

describe("MemoryGenericRepository", () => {
  let repository: MemoryGenericRepository<ITestItem>;

  beforeEach(() => {
    repository = new MemoryGenericRepository<ITestItem>(TEST_ENTITY, SEED);
  });

  // ===========================================================  lectura  ===
  describe("lectura", () => {
    it("devuelve el seed con PK autoincremental y marca de creación", async () => {
      const items = await repository.getAll({ orderBy: { field: "pkItem" } });

      expect(items.map((i) => i.pkItem)).toEqual([1, 2, 3]);
      expect(items[0].active).toBe(true);
      expect(items[0].createdAt).toBeInstanceOf(Date);
    });

    it("devuelve copias, no las entidades del almacén", async () => {
      const [item] = await repository.getAll({ take: 1 });
      item.name = "mutado";

      expect((await repository.getById(item.pkItem))?.name).not.toBe("mutado");
    });

    it("getById devuelve null cuando no existe", async () => {
      expect(await repository.getById(999)).toBeNull();
    });

    it("proyecta sólo las columnas pedidas", async () => {
      const [item] = await repository.find({ select: ["name"], take: 1 });
      expect(Object.keys(item)).toEqual(["name"]);
    });

    it("rechaza una propiedad no mapeada en el select", async () => {
      await expect(
        repository.find({ select: ["nope" as keyof ITestItem & string] })
      ).rejects.toThrow(/no está mapeada/);
    });

    it("ordena ascendente y descendente", async () => {
      const asc = await repository.find({ orderBy: { field: "qty", direction: "asc" } });
      const desc = await repository.find({ orderBy: { field: "qty", direction: "desc" } });

      expect(asc.map((i) => i.qty)).toEqual([10, 20, 30]);
      expect(desc.map((i) => i.qty)).toEqual([30, 20, 10]);
    });

    it("desempata con el segundo criterio de orden", async () => {
      const rows = await repository.find({
        orderBy: [{ field: "flag" }, { field: "qty", direction: "desc" }],
      });
      expect(rows.map((i) => i.name)).toEqual(["beta", "gamma", "alpha"]);
    });

    it("coloca los nulos al final, como Oracle en ASC", async () => {
      const rows = await repository.find({ orderBy: { field: "tag" } });
      expect(rows[rows.length - 1].tag).toBeNull();
    });

    it("aplica skip y take", async () => {
      const rows = await repository.find({ orderBy: { field: "pkItem" }, skip: 1, take: 1 });
      expect(rows.map((i) => i.name)).toEqual(["beta"]);
    });

    it("pagina con totales y número de páginas", async () => {
      const page = await repository.getPaged(2, 2, { orderBy: { field: "pkItem" } });

      expect(page).toMatchObject({ total: 3, page: 2, limit: 2, pages: 2 });
      expect(page.items.map((i) => i.name)).toEqual(["gamma"]);
    });

    it("normaliza página y límite inválidos en vez de romper", async () => {
      const page = await repository.getPaged(0, 0);
      expect(page).toMatchObject({ page: 1, limit: 1 });
    });

    it("count y exists respetan el filtro", async () => {
      expect(await repository.count({ qty: { gte: 20 } })).toBe(2);
      expect(await repository.exists({ name: "alpha" })).toBe(true);
      expect(await repository.exists({ name: "zzz" })).toBe(false);
    });

    it("firstOrDefault devuelve null si no hay coincidencias", async () => {
      expect(await repository.firstOrDefault({ where: { name: "zzz" } })).toBeNull();
    });
  });

  // ============================================================  filtros  ===
  describe("filtros", () => {
    const names = async (where: Parameters<typeof repository.count>[0]) =>
      (await repository.find({ where, orderBy: { field: "pkItem" } })).map((i) => i.name);

    it("igualdad directa", async () => {
      expect(await names({ name: "beta" })).toEqual(["beta"]);
    });

    it("comparadores numéricos", async () => {
      expect(await names({ qty: { gt: 10, lte: 20 } })).toEqual(["beta"]);
      expect(await names({ qty: { lt: 20 } })).toEqual(["alpha"]);
      expect(await names({ qty: { ne: 20 } })).toEqual(["alpha", "gamma"]);
    });

    it("between e in / notIn", async () => {
      expect(await names({ qty: { between: [10, 20] } })).toEqual(["alpha", "beta"]);
      expect(await names({ qty: { in: [10, 30] } })).toEqual(["alpha", "gamma"]);
      expect(await names({ qty: { notIn: [10, 30] } })).toEqual(["beta"]);
      expect(await names({ qty: { in: [] } })).toEqual([]);
    });

    it("like distingue mayúsculas e ilike no", async () => {
      expect(await names({ name: { like: "%LPH%" } })).toEqual([]);
      expect(await names({ name: { ilike: "%LPH%" } })).toEqual(["alpha"]);
      expect(await names({ name: { like: "b_ta" } })).toEqual(["beta"]);
      expect(await names({ name: { notLike: "alpha" } })).toEqual(["beta", "gamma"]);
    });

    it("nulos con null literal e isNull", async () => {
      expect(await names({ tag: null })).toEqual(["beta"]);
      expect(await names({ tag: { isNull: true } })).toEqual(["beta"]);
      expect(await names({ tag: { isNull: false } })).toEqual(["alpha", "gamma"]);
      expect(await names({ tag: { eq: null } })).toEqual(["beta"]);
      expect(await names({ tag: { ne: null } })).toEqual(["alpha", "gamma"]);
    });

    it("booleanos y fechas", async () => {
      expect(await names({ flag: true })).toEqual(["alpha", "gamma"]);
      expect(await names({ dueAt: { gte: new Date("2026-02-01T00:00:00Z") } })).toEqual([
        "beta",
        "gamma",
      ]);
    });

    it("combina grupos con $and, $or y $not", async () => {
      expect(await names({ $or: [{ name: "alpha" }, { qty: 30 }] })).toEqual(["alpha", "gamma"]);
      expect(await names({ $and: [{ flag: true }, { qty: { gt: 10 } }] })).toEqual(["gamma"]);
      expect(await names({ $not: { flag: true } })).toEqual(["beta"]);
      expect(await names({ $or: [] })).toEqual(["alpha", "beta", "gamma"]);
    });

    it("rechaza filtrar por una propiedad no mapeada", async () => {
      await expect(repository.find({ where: { nope: 1 } as never })).rejects.toThrow(
        /no está mapeada/
      );
    });
  });

  // ==========================================================  escritura  ===
  describe("escritura", () => {
    it("inserta asignando PK, activo y createdAt", async () => {
      const created = await repository.insert({ name: "delta", qty: 40 });

      expect(created.pkItem).toBe(4);
      expect(created.active).toBe(true);
      expect(created.createdAt).toBeInstanceOf(Date);
      expect(await repository.count()).toBe(4);
    });

    it("rechaza un insert sin datos, igual que el repositorio de Oracle", async () => {
      await expect(repository.insert({})).rejects.toThrow(/sin columnas que escribir/);
    });

    it("inserta en lote", async () => {
      expect(await repository.insertMany([{ name: "d" }, { name: "e" }])).toBe(2);
      expect(await repository.count()).toBe(5);
    });

    it("actualiza y sella updatedAt", async () => {
      const updated = await repository.update(1, { name: "alpha2" });

      expect(updated?.name).toBe("alpha2");
      expect(updated?.updatedAt).toBeInstanceOf(Date);
    });

    it("ignora la PK y las columnas no actualizables", async () => {
      const before = await repository.getById(1);
      const updated = await repository.update(1, { pkItem: 99, createdAt: new Date(0) });

      expect(updated?.pkItem).toBe(1);
      expect(updated?.createdAt).toEqual(before?.createdAt);
    });

    it("devuelve null al actualizar algo inexistente o ya borrado", async () => {
      expect(await repository.update(999, { name: "x" })).toBeNull();

      await repository.softDelete(1);
      expect(await repository.update(1, { name: "x" })).toBeNull();
    });

    it("updateWhere afecta a todo lo que case", async () => {
      expect(await repository.updateWhere({ flag: true }, { tag: "z" })).toBe(2);
      expect(await repository.count({ tag: "z" })).toBe(2);
    });
  });

  // ============================================================  borrado  ===
  describe("borrado", () => {
    it("el borrado lógico oculta la fila pero la conserva", async () => {
      expect(await repository.softDelete(1)).toBe(true);

      expect(await repository.getById(1)).toBeNull();
      expect(await repository.getById(1, { withDeleted: true })).not.toBeNull();
      expect(await repository.count()).toBe(2);
      expect(await repository.count(undefined, true)).toBe(3);
    });

    it("es idempotente: borrar dos veces devuelve false", async () => {
      await repository.softDelete(1);
      expect(await repository.softDelete(1)).toBe(false);
    });

    it("restore revierte el borrado lógico y no repite", async () => {
      await repository.softDelete(1);

      expect(await repository.restore(1)).toBe(true);
      expect(await repository.restore(1)).toBe(false);
      expect(await repository.getById(1)).not.toBeNull();
    });

    it("softDelete/restore devuelven false si la fila no existe", async () => {
      expect(await repository.softDelete(999)).toBe(false);
      expect(await repository.restore(999)).toBe(false);
    });

    it("el borrado físico elimina la fila", async () => {
      expect(await repository.hardDelete(1)).toBe(true);
      expect(await repository.hardDelete(1)).toBe(false);
      expect(await repository.count(undefined, true)).toBe(2);
    });

    it("hardDeleteWhere alcanza también a las borradas lógicamente", async () => {
      await repository.softDelete(1);

      expect(await repository.hardDeleteWhere({ qty: { lte: 20 } })).toBe(2);
      expect(await repository.count(undefined, true)).toBe(1);
      expect(await repository.hardDeleteWhere({ qty: { gt: 900 } })).toBe(0);
    });

    it("lanza si la entidad no declara borrado lógico", async () => {
      const plain = new MemoryGenericRepository<IPlainItem, string>(PLAIN_ENTITY, [
        { code: "A", label: "uno" },
      ]);

      await expect(plain.softDelete("A")).rejects.toThrow(/no declara softDelete/);
    });
  });

  // ==================================================  entidades simples  ===
  it("exige la PK cuando la entidad no usa identity", async () => {
    const plain = new MemoryGenericRepository<IPlainItem, string>(PLAIN_ENTITY, []);

    await expect(plain.insert({ label: "sin código" })).rejects.toThrow(/PK es obligatoria/);

    const created = await plain.insert({ code: "A", label: "uno" });
    expect(created.code).toBe("A");
  });

  // ==============================================  unidad de trabajo  =======
  it("snapshot y restoreSnapshot devuelven el almacén a su estado previo", async () => {
    const snapshot = repository.snapshot();

    await repository.insert({ name: "delta" });
    await repository.hardDelete(1);
    repository.restoreSnapshot(snapshot);

    expect((await repository.getAll({ orderBy: { field: "pkItem" } })).map((i) => i.name)).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
    // La secuencia también se restaura: el siguiente insert reutiliza el 4.
    expect((await repository.insert({ name: "nuevo" })).pkItem).toBe(4);
  });
});
