import { EntitySchema } from "../../../../../src/infrastructure/repositories/base/entity-metadata";
import { toMongoFilter } from "../../../../../src/infrastructure/repositories/base/query/mongo.filter";
import type { WhereFilter } from "../../../../../src/domain/interfaces/infrastructure/repositories/generic.repository.interface";
import { ITestItem, TEST_ENTITY } from "./test-entity";

const schema = new EntitySchema<ITestItem>(TEST_ENTITY);
const compile = (filter?: WhereFilter<ITestItem>) => toMongoFilter(filter, schema);

describe("toMongoFilter", () => {
  it("sin filtro no genera condiciones", () => {
    expect(compile(undefined)).toEqual({});
    expect(compile({})).toEqual({});
  });

  it("un valor suelto es una igualdad sobre el campo mapeado", () => {
    // La clave del documento es la columna (NAME), no la propiedad (name): es lo
    // que hace que el mismo filtro sirva para Mongo y para los motores SQL.
    expect(compile({ name: "alpha" })).toEqual({ NAME: { $eq: "alpha" } });
  });

  it("un null suelto significa IS NULL", () => {
    // `$eq: null` alcanza también a los documentos que no traen el campo, que es
    // lo que en SQL sería una columna sin valor.
    expect(compile({ tag: null })).toEqual({ TAG: { $eq: null } });
  });

  it.each([
    ["eq", "$eq"],
    ["ne", "$ne"],
    ["gt", "$gt"],
    ["gte", "$gte"],
    ["lt", "$lt"],
    ["lte", "$lte"],
  ])("traduce el operador %s a %s", (operator, mongoOperator) => {
    expect(compile({ qty: { [operator]: 5 } } as never)).toEqual({ QTY: { [mongoOperator]: 5 } });
  });

  it("eq/ne contra null se comparan contra null, sin operador especial", () => {
    expect(compile({ tag: { eq: null } })).toEqual({ TAG: { $eq: null } });
    expect(compile({ tag: { ne: null } })).toEqual({ TAG: { $ne: null } });
  });

  it("isNull se resuelve como la comparación contra null", () => {
    expect(compile({ tag: { isNull: true } })).toEqual({ TAG: { $eq: null } });
    expect(compile({ tag: { isNull: false } })).toEqual({ TAG: { $ne: null } });
  });

  it("like traduce el patrón de SQL a una expresión regular anclada", () => {
    // `%` es cualquier cosa y `_` un carácter; el resto del patrón se escapa,
    // así que un punto del usuario no se convierte en un comodín de regex.
    expect(compile({ name: { like: "a%" } })).toEqual({ NAME: { $regex: /^a.*$/ } });
    expect(compile({ name: { like: "a_c.d" } })).toEqual({ NAME: { $regex: /^a.c\.d$/ } });
  });

  it("ilike es el mismo patrón con la bandera de insensibilidad", () => {
    expect(compile({ name: { ilike: "%norte%" } })).toEqual({ NAME: { $regex: /^.*norte.*$/i } });
  });

  it("notLike niega la expresión regular", () => {
    expect(compile({ name: { notLike: "a%" } })).toEqual({ NAME: { $not: /^a.*$/ } });
  });

  it("in y notIn se traducen a $in y $nin", () => {
    expect(compile({ qty: { in: [1, 2, 3] } })).toEqual({ QTY: { $in: [1, 2, 3] } });
    expect(compile({ qty: { notIn: [1] } })).toEqual({ QTY: { $nin: [1] } });
  });

  it("una lista vacía en in no casa con nada", () => {
    // `$in: []` ya no encuentra nada por sí solo; no hace falta la condición
    // constante que el SQL necesita para evitar un `IN ()` inválido.
    expect(compile({ qty: { in: [] } })).toEqual({ QTY: { $in: [] } });
    expect(compile({ qty: { notIn: [] } })).toEqual({ QTY: { $nin: [] } });
  });

  it("between se abre en sus dos extremos, ambos inclusivos", () => {
    expect(compile({ qty: { between: [1, 9] } })).toEqual({ QTY: { $gte: 1, $lte: 9 } });
  });

  it("varios operadores sobre el mismo campo comparten documento", () => {
    expect(compile({ qty: { gte: 1, lte: 9 } })).toEqual({ QTY: { $gte: 1, $lte: 9 } });
  });

  it("dos operadores que compartirían clave se reparten en cláusulas distintas", () => {
    // `gte` y `between` producen los dos un `$gte`: en un único objeto el
    // segundo pisaría al primero y la condición se perdería en silencio.
    expect(compile({ qty: { gte: 5, between: [1, 9] } })).toEqual({
      $and: [{ QTY: { $gte: 5, $lte: 9 } }, { QTY: { $gte: 1 } }],
    });
  });

  it("varios campos se unen con $and explícito", () => {
    // Se evita fusionarlos en un solo objeto: dos condiciones sobre el mismo
    // campo compartirían clave y una borraría a la otra.
    expect(compile({ name: "a", qty: 1 })).toEqual({
      $and: [{ NAME: { $eq: "a" } }, { QTY: { $eq: 1 } }],
    });
  });

  it("$and anida un grupo", () => {
    expect(compile({ $and: [{ name: "a" }, { qty: 1 }] })).toEqual({
      $and: [{ NAME: { $eq: "a" } }, { QTY: { $eq: 1 } }],
    });
  });

  it("un $and de un solo miembro no añade envoltura", () => {
    expect(compile({ $and: [{ name: "a" }] })).toEqual({ NAME: { $eq: "a" } });
  });

  it("$or anida un grupo alternativo", () => {
    expect(compile({ $or: [{ name: "a" }, { qty: 1 }] })).toEqual({
      $or: [{ NAME: { $eq: "a" } }, { QTY: { $eq: 1 } }],
    });
  });

  it("$not se expresa con $nor, que es lo que MongoDB tiene para negar un grupo", () => {
    // `$not` sólo existe dentro de un campo; `$nor` con un único miembro es su
    // equivalente exacto a nivel de documento.
    expect(compile({ $not: { name: "a" } })).toEqual({ $nor: [{ NAME: { $eq: "a" } }] });
  });

  it("los grupos anidados conservan su estructura", () => {
    const filter: WhereFilter<ITestItem> = {
      $and: [{ flag: true }, { $or: [{ name: { ilike: "%a%" } }, { tag: null }] }],
    };

    expect(compile(filter)).toEqual({
      $and: [
        { FLAG: { $eq: 1 } },
        { $or: [{ NAME: { $regex: /^.*a.*$/i } }, { TAG: { $eq: null } }] },
      ],
    });
  });

  it("los grupos vacíos no ensucian la consulta", () => {
    // Un `$or: []` sería un error para el servidor, y un `$nor: [{}]` negaría
    // absolutamente todo: un grupo sin condiciones simplemente no aporta nada.
    expect(compile({ $and: [] })).toEqual({});
    expect(compile({ $or: [{}] })).toEqual({});
    expect(compile({ $not: {} })).toEqual({});
  });

  it("ignora las claves con valor undefined", () => {
    expect(compile({ name: undefined, qty: 1 })).toEqual({ QTY: { $eq: 1 } });
  });

  it("convierte los booleanos al 1/0 con el que están guardados", () => {
    // El seed escribe los flags como números para compartir mapeo con Oracle,
    // donde son NUMBER(1); comparar contra `true` no encontraría nada.
    expect(compile({ flag: true })).toEqual({ FLAG: { $eq: 1 } });
    expect(compile({ flag: false })).toEqual({ FLAG: { $eq: 0 } });
  });

  it("convierte las fechas a Date, que es lo que el driver compara contra BSON", () => {
    const compiled = compile({ dueAt: { gte: "2026-01-10T10:00:00Z" } } as never) as {
      DUE_AT: { $gte: Date };
    };

    expect(compiled.DUE_AT.$gte).toBeInstanceOf(Date);
    expect(compiled.DUE_AT.$gte.toISOString()).toBe("2026-01-10T10:00:00.000Z");
  });

  it("rechaza una propiedad no mapeada, que es la barrera contra un campo arbitrario", () => {
    expect(() => compile({ $where: "sleep(1000)" } as never)).toThrow(/no está mapeada/);
  });
});
