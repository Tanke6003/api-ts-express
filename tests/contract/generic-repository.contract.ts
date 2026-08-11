// tests/contract/generic-repository.contract.ts
//
// Batería de contrato de `IGenericRepository<T>`.
//
// No es un test por sí misma: es el mismo juego de aserciones que debe pasar
// **cualquier** implementación, se apoye en SQL, en documentos o en un array.
// Cada driver la invoca con una fábrica y así la promesa central de la
// plantilla —"todos los motores se comportan igual"— queda comprobada en vez de
// prometida en un README.
//
// Sólo cubre comportamiento observable a través del contrato. Lo propio de cada
// motor (qué SQL se genera, cómo vuelve una PK) se prueba en su propio test.
import type { IGenericRepository } from "../../src/domain/interfaces/infrastructure/repositories/generic.repository.interface";

/** Entidad mínima que la batería necesita para operar. */
export interface ContractItem {
  pkItem: number;
  name: string;
  qty: number;
  tag?: string | null;
  active?: boolean;
}

export interface ContractSetup {
  /** Repositorio vacío y aislado para cada prueba. */
  create(): Promise<IGenericRepository<ContractItem>> | IGenericRepository<ContractItem>;
  /** Se ejecuta al terminar, por si el driver tiene que cerrar algo. */
  teardown?(): Promise<void> | void;
}

export function runGenericRepositoryContract(driver: string, setup: ContractSetup): void {
  describe(`contrato de IGenericRepository — ${driver}`, () => {
    let repository: IGenericRepository<ContractItem>;

    const seed = async () => {
      await repository.insert({ name: "alpha", qty: 10, tag: "x" });
      await repository.insert({ name: "beta", qty: 20, tag: null });
      await repository.insert({ name: "gamma", qty: 30, tag: "y" });
    };

    const names = async (where?: Parameters<typeof repository.count>[0]) =>
      (await repository.find({ where, orderBy: { field: "pkItem" } })).map((i) => i.name);

    beforeEach(async () => {
      repository = await setup.create();
    });

    afterAll(async () => {
      await setup.teardown?.();
    });

    // ==========================================================  escritura  ==
    describe("alta", () => {
      it("devuelve la entidad con la PK ya asignada", async () => {
        const created = await repository.insert({ name: "alpha", qty: 1 });

        expect(created.pkItem).toEqual(expect.any(Number));
        expect(created.name).toBe("alpha");
      });

      it("asigna PKs distintas a cada alta", async () => {
        const uno = await repository.insert({ name: "uno", qty: 1 });
        const dos = await repository.insert({ name: "dos", qty: 2 });

        expect(uno.pkItem).not.toBe(dos.pkItem);
      });

      it("un alta sin datos es un error, no una fila vacía", async () => {
        await expect(repository.insert({})).rejects.toThrow();
      });

      it("el alta masiva devuelve cuántas entraron", async () => {
        expect(await repository.insertMany([{ name: "a" }, { name: "b" }])).toBe(2);
        expect(await repository.count()).toBe(2);
      });
    });

    describe("lectura", () => {
      beforeEach(seed);

      it("getById devuelve la fila, o null si no existe", async () => {
        const [primera] = await repository.find({ orderBy: { field: "pkItem" }, take: 1 });

        expect(await repository.getById(primera.pkItem)).toMatchObject({ name: "alpha" });
        expect(await repository.getById(999999)).toBeNull();
      });

      it("cuenta y comprueba existencia con filtro", async () => {
        expect(await repository.count()).toBe(3);
        expect(await repository.count({ qty: { gte: 20 } })).toBe(2);
        expect(await repository.exists({ name: "alpha" })).toBe(true);
        expect(await repository.exists({ name: "zzz" })).toBe(false);
      });

      it("firstOrDefault devuelve null si no hay coincidencias", async () => {
        expect(await repository.firstOrDefault({ where: { name: "zzz" } })).toBeNull();
      });

      it("ordena en ambos sentidos", async () => {
        const asc = await repository.find({ orderBy: { field: "qty", direction: "asc" } });
        const desc = await repository.find({ orderBy: { field: "qty", direction: "desc" } });

        expect(asc.map((i) => i.qty)).toEqual([10, 20, 30]);
        expect(desc.map((i) => i.qty)).toEqual([30, 20, 10]);
      });

      it("aplica skip y take", async () => {
        const rows = await repository.find({ orderBy: { field: "qty" }, skip: 1, take: 1 });

        expect(rows.map((i) => i.name)).toEqual(["beta"]);
      });

      it("pagina con totales coherentes", async () => {
        const page = await repository.getPaged(2, 2, { orderBy: { field: "qty" } });

        expect(page).toMatchObject({ total: 3, page: 2, limit: 2, pages: 2 });
        expect(page.items.map((i) => i.name)).toEqual(["gamma"]);
      });

      it("proyecta sólo las propiedades pedidas", async () => {
        const [item] = await repository.find({ select: ["name"], take: 1 });

        expect(item.name).toEqual(expect.any(String));
        expect(item.qty).toBeUndefined();
      });

      it("rechaza una propiedad que no está mapeada", async () => {
        await expect(repository.find({ where: { nope: 1 } as never })).rejects.toThrow();
      });
    });

    // ============================================================  filtros  ==
    describe("lenguaje de filtros", () => {
      beforeEach(seed);

      it("igualdad directa", async () => {
        expect(await names({ name: "beta" })).toEqual(["beta"]);
      });

      it("comparadores", async () => {
        expect(await names({ qty: { gt: 10, lte: 20 } })).toEqual(["beta"]);
        expect(await names({ qty: { lt: 20 } })).toEqual(["alpha"]);
        expect(await names({ qty: { ne: 20 } })).toEqual(["alpha", "gamma"]);
        expect(await names({ qty: { gte: 30 } })).toEqual(["gamma"]);
      });

      it("between, in y notIn", async () => {
        expect(await names({ qty: { between: [10, 20] } })).toEqual(["alpha", "beta"]);
        expect(await names({ qty: { in: [10, 30] } })).toEqual(["alpha", "gamma"]);
        expect(await names({ qty: { notIn: [10, 30] } })).toEqual(["beta"]);
      });

      // Una lista vacía no puede casar con nada; el caso se cuela fácil al
      // construir filtros dinámicos.
      it("una lista vacía no devuelve nada", async () => {
        expect(await names({ qty: { in: [] } })).toEqual([]);
      });

      it("nulos, con null literal y con isNull", async () => {
        expect(await names({ tag: null })).toEqual(["beta"]);
        expect(await names({ tag: { isNull: true } })).toEqual(["beta"]);
        expect(await names({ tag: { isNull: false } })).toEqual(["alpha", "gamma"]);
      });

      it("like distingue mayúsculas e ilike no", async () => {
        expect(await names({ name: { like: "%LPH%" } })).toEqual([]);
        expect(await names({ name: { ilike: "%LPH%" } })).toEqual(["alpha"]);
      });

      it("combina grupos con $and, $or y $not", async () => {
        expect(await names({ $or: [{ name: "alpha" }, { qty: 30 }] })).toEqual(["alpha", "gamma"]);
        expect(await names({ $and: [{ qty: { gte: 20 } }, { tag: { isNull: false } }] })).toEqual([
          "gamma",
        ]);
        expect(await names({ $not: { qty: 20 } })).toEqual(["alpha", "gamma"]);
      });
    });

    // ==========================================================  edición  ====
    describe("edición", () => {
      beforeEach(seed);

      it("actualiza sólo lo enviado y devuelve el resultado", async () => {
        const [item] = await repository.find({ orderBy: { field: "pkItem" }, take: 1 });
        const updated = await repository.update(item.pkItem, { name: "alpha2" });

        expect(updated).toMatchObject({ name: "alpha2", qty: 10 });
      });

      it("devuelve null al actualizar algo que no existe", async () => {
        expect(await repository.update(999999, { name: "x" })).toBeNull();
      });

      it("ignora la PK que venga en el cuerpo", async () => {
        const [item] = await repository.find({ orderBy: { field: "pkItem" }, take: 1 });
        const updated = await repository.update(item.pkItem, { pkItem: 987654, name: "x" });

        expect(updated?.pkItem).toBe(item.pkItem);
      });

      it("updateWhere alcanza a todas las filas que casan", async () => {
        expect(await repository.updateWhere({ qty: { gte: 20 } }, { tag: "z" })).toBe(2);
        expect(await repository.count({ tag: "z" })).toBe(2);
      });
    });

    // ==========================================================  borrados  ==
    describe("borrado lógico", () => {
      beforeEach(seed);

      it("oculta la fila pero la conserva", async () => {
        const [item] = await repository.find({ orderBy: { field: "pkItem" }, take: 1 });

        expect(await repository.softDelete(item.pkItem)).toBe(true);
        expect(await repository.getById(item.pkItem)).toBeNull();
        expect(await repository.getById(item.pkItem, { withDeleted: true })).not.toBeNull();
        expect(await repository.count()).toBe(2);
        expect(await repository.count(undefined, true)).toBe(3);
      });

      // Borrar dos veces no debe fingir que hizo algo la segunda.
      it("es idempotente", async () => {
        const [item] = await repository.find({ orderBy: { field: "pkItem" }, take: 1 });

        expect(await repository.softDelete(item.pkItem)).toBe(true);
        expect(await repository.softDelete(item.pkItem)).toBe(false);
      });

      it("restore lo revierte, y tampoco se repite", async () => {
        const [item] = await repository.find({ orderBy: { field: "pkItem" }, take: 1 });
        await repository.softDelete(item.pkItem);

        expect(await repository.restore(item.pkItem)).toBe(true);
        expect(await repository.restore(item.pkItem)).toBe(false);
        expect(await repository.getById(item.pkItem)).not.toBeNull();
      });

      it("devuelve false si la fila no existe", async () => {
        expect(await repository.softDelete(999999)).toBe(false);
        expect(await repository.restore(999999)).toBe(false);
      });

      it("una fila con borrado lógico no se puede actualizar", async () => {
        const [item] = await repository.find({ orderBy: { field: "pkItem" }, take: 1 });
        await repository.softDelete(item.pkItem);

        expect(await repository.update(item.pkItem, { name: "x" })).toBeNull();
      });
    });

    describe("borrado físico", () => {
      beforeEach(seed);

      it("elimina la fila de verdad", async () => {
        const [item] = await repository.find({ orderBy: { field: "pkItem" }, take: 1 });

        expect(await repository.hardDelete(item.pkItem)).toBe(true);
        expect(await repository.hardDelete(item.pkItem)).toBe(false);
        expect(await repository.count(undefined, true)).toBe(2);
      });

      // Si no alcanzara a las borradas lógicamente dejaría filas huérfanas
      // apuntando por clave foránea a algo que ya no está.
      it("hardDeleteWhere alcanza también a las borradas lógicamente", async () => {
        const [item] = await repository.find({ orderBy: { field: "pkItem" }, take: 1 });
        await repository.softDelete(item.pkItem);

        expect(await repository.hardDeleteWhere({ qty: { lte: 20 } })).toBe(2);
        expect(await repository.count(undefined, true)).toBe(1);
      });
    });

    // ==================================================  API encadenable  ===
    describe("query() encadenable", () => {
      beforeEach(seed);

      it("acumula filtros con AND y ordena", async () => {
        const rows = await repository
          .query()
          .where({ qty: { gte: 10 } })
          .where({ tag: { isNull: false } })
          .orderByDescending("qty")
          .toList();

        expect(rows.map((i) => i.name)).toEqual(["gamma", "alpha"]);
      });

      it("count, any y firstOrDefault", async () => {
        expect(await repository.query().where({ qty: { gte: 20 } }).count()).toBe(2);
        expect(await repository.query().where({ name: "zzz" }).any()).toBe(false);
        expect(
          await repository.query().where({ name: "beta" }).firstOrDefault()
        ).toMatchObject({ name: "beta" });
      });

      it("toPagedList devuelve la página con sus totales", async () => {
        const page = await repository.query().orderBy("qty").toPagedList(1, 2);

        expect(page).toMatchObject({ total: 3, page: 1, limit: 2, pages: 2 });
        expect(page.items).toHaveLength(2);
      });
    });
  });
}
