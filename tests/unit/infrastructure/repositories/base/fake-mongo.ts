// tests/unit/infrastructure/repositories/base/fake-mongo.ts
import type { Collection, Document } from "mongodb";
import type { IMongoDataSource } from "../../../../../src/infrastructure/repositories/base/drivers/mongo.generic.repository";

/**
 * MongoDB de mentira: colecciones en memoria que entienden exactamente el
 * subconjunto del lenguaje de consulta que produce `toMongoFilter`.
 *
 * No pretende ser un servidor completo —lanza ante cualquier operador que no
 * emitamos, para que un cambio en el traductor no pase desapercibido—, pero sí
 * evalúa los filtros de verdad: así los tests comprueban el comportamiento del
 * repositorio y no sólo que llame al driver.
 */

type Doc = Record<string, unknown>;

/** Igualdad laxa: `null` cubre también el campo ausente, como en MongoDB. */
function equals(value: unknown, operand: unknown): boolean {
  if (operand === null) return value === null || value === undefined;
  if (value instanceof Date && operand instanceof Date) return value.getTime() === operand.getTime();
  return value === operand;
}

function compare(value: unknown, operand: unknown): number | null {
  const left = value instanceof Date ? value.getTime() : value;
  const right = operand instanceof Date ? operand.getTime() : operand;
  if (left === null || left === undefined || right === null || right === undefined) return null;
  if (left === right) return 0;
  return (left as number) < (right as number) ? -1 : 1;
}

function matchesOperators(value: unknown, operators: Doc): boolean {
  return Object.entries(operators).every(([operator, operand]) => {
    switch (operator) {
      case "$eq":
        return equals(value, operand);
      case "$ne":
        return !equals(value, operand);
      case "$gt": {
        const result = compare(value, operand);
        return result !== null && result > 0;
      }
      case "$gte": {
        const result = compare(value, operand);
        return result !== null && result >= 0;
      }
      case "$lt": {
        const result = compare(value, operand);
        return result !== null && result < 0;
      }
      case "$lte": {
        const result = compare(value, operand);
        return result !== null && result <= 0;
      }
      case "$in":
        return (operand as unknown[]).some((candidate) => equals(value, candidate));
      case "$nin":
        return !(operand as unknown[]).some((candidate) => equals(value, candidate));
      case "$regex":
        return typeof value === "string" && (operand as RegExp).test(value);
      case "$not":
        // El traductor sólo produce `$not` con una expresión regular dentro.
        return !(typeof value === "string" && (operand as RegExp).test(value));
      default:
        throw new Error(`[FakeMongo] Operador no soportado: ${operator}`);
    }
  });
}

export function matchesQuery(document: Doc, query: Doc): boolean {
  return Object.entries(query).every(([key, condition]) => {
    if (key === "$and") return (condition as Doc[]).every((inner) => matchesQuery(document, inner));
    if (key === "$or") return (condition as Doc[]).some((inner) => matchesQuery(document, inner));
    if (key === "$nor") return !(condition as Doc[]).some((inner) => matchesQuery(document, inner));

    // `{ _id: "ITEMS" }`: un valor suelto es una igualdad, como en el servidor.
    // El traductor siempre emite operadores, pero el acceso al contador no.
    if (condition === null || typeof condition !== "object" || condition instanceof Date) {
      return equals(document[key], condition);
    }
    return matchesOperators(document[key], condition as Doc);
  });
}

function project(document: Doc, projection?: Doc): Doc {
  if (!projection) return { ...document };

  const included = Object.entries(projection).filter(([, value]) => value === 1).map(([key]) => key);
  const result: Doc = {};

  for (const [key, value] of Object.entries(document)) {
    if (projection[key] === 0) continue;
    if (included.length > 0 && !included.includes(key)) continue;
    result[key] = value;
  }
  return result;
}

function applySort(documents: Doc[], sort?: Doc): Doc[] {
  if (!sort) return documents;

  return [...documents].sort((left, right) => {
    for (const [field, direction] of Object.entries(sort)) {
      const result = compare(left[field], right[field]) ?? 0;
      if (result !== 0) return result * (direction as number);
    }
    return 0;
  });
}

export interface FakeFindOptions {
  projection?: Doc;
  sort?: Doc;
  skip?: number;
  limit?: number;
  session?: unknown;
}

/** Llamada registrada, para poder afirmar sobre la sesión que se propagó. */
export interface FakeCall {
  operation: string;
  session?: unknown;
}

export class FakeMongoCollection {
  readonly documents: Doc[] = [];
  private sequence = 0;

  constructor(
    readonly name: string,
    private readonly calls: FakeCall[]
  ) {}

  /** Carga documentos sin pasar por el repositorio, como haría el seed. */
  seed(documents: Doc[]): this {
    for (const document of documents) this.documents.push({ _id: this.nextObjectId(), ...document });
    return this;
  }

  private nextObjectId(): string {
    this.sequence += 1;
    return `oid-${this.name}-${this.sequence}`;
  }

  private select(filter: Doc): Doc[] {
    return this.documents.filter((document) => matchesQuery(document, filter));
  }

  find(filter: Doc, options: FakeFindOptions = {}) {
    this.calls.push({ operation: `find:${this.name}`, session: options.session });

    return {
      toArray: async (): Promise<Doc[]> => {
        let rows = applySort(this.select(filter), options.sort);
        if (options.skip) rows = rows.slice(options.skip);
        if (options.limit !== undefined) rows = rows.slice(0, options.limit);
        return rows.map((row) => project(row, options.projection));
      },
    };
  }

  async countDocuments(filter: Doc, options: { session?: unknown } = {}): Promise<number> {
    this.calls.push({ operation: `count:${this.name}`, session: options.session });
    return this.select(filter).length;
  }

  async insertOne(document: Doc, options: { session?: unknown } = {}) {
    this.calls.push({ operation: `insertOne:${this.name}`, session: options.session });
    const stored = { _id: this.nextObjectId(), ...document };
    this.documents.push(stored);
    return { insertedId: stored._id, acknowledged: true };
  }

  async insertMany(documents: Doc[], options: { session?: unknown } = {}) {
    this.calls.push({ operation: `insertMany:${this.name}`, session: options.session });
    for (const document of documents) this.documents.push({ _id: this.nextObjectId(), ...document });
    return { insertedCount: documents.length, acknowledged: true };
  }

  private applyUpdate(targets: Doc[], update: Doc): number {
    const set = (update.$set ?? {}) as Doc;
    const increment = (update.$inc ?? {}) as Doc;

    for (const target of targets) {
      for (const [field, value] of Object.entries(set)) target[field] = value;
      for (const [field, value] of Object.entries(increment)) {
        target[field] = Number(target[field] ?? 0) + Number(value);
      }
    }
    return targets.length;
  }

  async updateOne(filter: Doc, update: Doc, options: { session?: unknown } = {}) {
    this.calls.push({ operation: `updateOne:${this.name}`, session: options.session });
    const [target] = this.select(filter);
    const matched = target ? this.applyUpdate([target], update) : 0;
    return { matchedCount: matched, modifiedCount: matched, acknowledged: true };
  }

  async updateMany(filter: Doc, update: Doc, options: { session?: unknown } = {}) {
    this.calls.push({ operation: `updateMany:${this.name}`, session: options.session });
    const matched = this.applyUpdate(this.select(filter), update);
    return { matchedCount: matched, modifiedCount: matched, acknowledged: true };
  }

  async findOneAndUpdate(
    filter: Doc,
    update: Doc,
    options: { upsert?: boolean; returnDocument?: string; session?: unknown } = {}
  ): Promise<Doc | null> {
    this.calls.push({ operation: `findOneAndUpdate:${this.name}`, session: options.session });

    let [target] = this.select(filter);
    if (!target && options.upsert) {
      // El upsert nace con las claves del filtro y los campos numéricos a cero,
      // que es justo lo que hace el servidor antes de aplicar el $inc.
      target = { ...filter };
      this.documents.push(target);
    }
    if (!target) return null;

    this.applyUpdate([target], update);
    return { ...target };
  }

  async deleteOne(filter: Doc, options: { session?: unknown } = {}) {
    this.calls.push({ operation: `deleteOne:${this.name}`, session: options.session });
    const [target] = this.select(filter);
    if (!target) return { deletedCount: 0, acknowledged: true };

    this.documents.splice(this.documents.indexOf(target), 1);
    return { deletedCount: 1, acknowledged: true };
  }

  async deleteMany(filter: Doc, options: { session?: unknown } = {}) {
    this.calls.push({ operation: `deleteMany:${this.name}`, session: options.session });
    const targets = this.select(filter);
    for (const target of targets) this.documents.splice(this.documents.indexOf(target), 1);
    return { deletedCount: targets.length, acknowledged: true };
  }
}

export class FakeMongoDataSource implements IMongoDataSource {
  readonly collections = new Map<string, FakeMongoCollection>();
  readonly calls: FakeCall[] = [];

  collectionOf(name: string): FakeMongoCollection {
    const existing = this.collections.get(name);
    if (existing) return existing;

    const created = new FakeMongoCollection(name, this.calls);
    this.collections.set(name, created);
    return created;
  }

  async collection<TDoc extends Document = Document>(name: string): Promise<Collection<TDoc>> {
    return this.collectionOf(name) as unknown as Collection<TDoc>;
  }

  /** Documentos crudos de una colección, tal y como quedaron guardados. */
  documentsOf(name: string): Record<string, unknown>[] {
    return this.collectionOf(name).documents;
  }
}
