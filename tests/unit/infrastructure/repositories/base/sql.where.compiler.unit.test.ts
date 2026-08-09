import { EntitySchema } from "../../../../../src/infrastructure/repositories/base/entity-metadata";
import { SqlWhereCompiler } from "../../../../../src/infrastructure/repositories/base/sql.where.compiler";
import { ITestItem, TEST_ENTITY } from "./test-entity";

const schema = new EntitySchema<ITestItem>(TEST_ENTITY);
const compile = (filter: Parameters<SqlWhereCompiler<ITestItem>["compile"]>[0], prefix?: string) =>
  new SqlWhereCompiler<ITestItem>(schema, prefix).compile(filter);

describe("SqlWhereCompiler", () => {
  it("sin filtro no genera cláusula", () => {
    expect(compile(undefined)).toEqual({ sql: "", binds: {} });
    expect(compile({}).sql).toBe("");
  });

  it("un valor suelto es una igualdad con bind", () => {
    expect(compile({ name: "alpha" })).toEqual({ sql: "NAME = :w0", binds: { w0: "alpha" } });
  });

  it("null literal se traduce a IS NULL", () => {
    expect(compile({ tag: null })).toEqual({ sql: "TAG IS NULL", binds: {} });
  });

  it.each([
    ["eq", "QTY = :w0"],
    ["ne", "QTY <> :w0"],
    ["gt", "QTY > :w0"],
    ["gte", "QTY >= :w0"],
    ["lt", "QTY < :w0"],
    ["lte", "QTY <= :w0"],
  ])("traduce el operador %s", (operator, expected) => {
    expect(compile({ qty: { [operator]: 5 } } as never).sql).toBe(expected);
  });

  it("eq/ne contra null usan IS NULL / IS NOT NULL", () => {
    expect(compile({ tag: { eq: null } }).sql).toBe("TAG IS NULL");
    expect(compile({ tag: { ne: null } }).sql).toBe("TAG IS NOT NULL");
  });

  it("like, notLike e ilike", () => {
    expect(compile({ name: { like: "a%" } }).sql).toBe("NAME LIKE :w0");
    expect(compile({ name: { notLike: "a%" } }).sql).toBe("NAME NOT LIKE :w0");
    // ilike normaliza los dos lados para no depender del collation.
    expect(compile({ name: { ilike: "a%" } }).sql).toBe("UPPER(NAME) LIKE UPPER(:w0)");
  });

  it("in y notIn generan un bind por elemento", () => {
    const result = compile({ qty: { in: [1, 2, 3] } });

    expect(result.sql).toBe("QTY IN (:w0, :w1, :w2)");
    expect(result.binds).toEqual({ w0: 1, w1: 2, w2: 3 });
    expect(compile({ qty: { notIn: [1] } }).sql).toBe("QTY NOT IN (:w0)");
  });

  it("una lista vacía se vuelve una condición constante en lugar de un IN () inválido", () => {
    expect(compile({ qty: { in: [] } }).sql).toBe("1 = 0");
    expect(compile({ qty: { notIn: [] } }).sql).toBe("1 = 1");
  });

  it("between e isNull", () => {
    expect(compile({ qty: { between: [1, 9] } }).sql).toBe("QTY BETWEEN :w0 AND :w1");
    expect(compile({ tag: { isNull: true } }).sql).toBe("TAG IS NULL");
    expect(compile({ tag: { isNull: false } }).sql).toBe("TAG IS NOT NULL");
  });

  it("varios operadores sobre el mismo campo se agrupan con AND", () => {
    expect(compile({ qty: { gte: 1, lte: 9 } }).sql).toBe("(QTY >= :w0 AND QTY <= :w1)");
  });

  it("varios campos se unen con AND", () => {
    expect(compile({ name: "a", qty: 1 }).sql).toBe("NAME = :w0 AND QTY = :w1");
  });

  it("$and, $or y $not anidan grupos", () => {
    expect(compile({ $and: [{ name: "a" }, { qty: 1 }] }).sql).toBe("(NAME = :w0 AND QTY = :w1)");
    expect(compile({ $or: [{ name: "a" }, { qty: 1 }] }).sql).toBe("(NAME = :w0 OR QTY = :w1)");
    expect(compile({ $not: { name: "a" } }).sql).toBe("NOT (NAME = :w0)");
  });

  it("los grupos vacíos no ensucian el SQL", () => {
    expect(compile({ $and: [] }).sql).toBe("");
    expect(compile({ $or: [{}] }).sql).toBe("");
    expect(compile({ $not: {} }).sql).toBe("");
  });

  it("ignora las claves con valor undefined", () => {
    expect(compile({ name: undefined, qty: 1 }).sql).toBe("QTY = :w0");
  });

  it("convierte los booleanos al 1/0 de la columna", () => {
    expect(compile({ flag: true }).binds).toEqual({ w0: 1 });
    expect(compile({ flag: false }).binds).toEqual({ w0: 0 });
  });

  it("el prefijo evita que los binds del WHERE choquen con los del SET", () => {
    expect(compile({ name: "a" }, "z")).toEqual({ sql: "NAME = :z0", binds: { z0: "a" } });
  });

  it("rechaza una propiedad no mapeada, que es lo que impide inyectar identificadores", () => {
    expect(() => compile({ "NAME; DROP TABLE ITEMS": 1 } as never)).toThrow(/no está mapeada/);
  });
});
