// src/infrastructure/repositories/base/memory.filter.ts
import type {
  FieldOperators,
  WhereFilter,
} from "../../../domain/interfaces/infrastructure/repositories/generic.repository.interface";
import { EntitySchema } from "./entity-metadata";
import { isOperatorObject, likeToRegExp } from "./filter.helpers";

/**
 * Evaluación en memoria del mismo `WhereFilter<T>` que `OracleWhereCompiler`
 * traduce a SQL. Mantener las dos implementaciones alineadas es lo que permite
 * que un módulo se desarrolle contra el datasource dummy y funcione igual
 * cuando se apunta a Oracle.
 */

/** Lleva cualquier valor a algo comparable con `<` y `>` de forma consistente. */
function toComparable(value: unknown): number | string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return value;
  return String(value);
}

/** Igualdad laxa que trata fechas equivalentes como iguales. */
function looseEquals(a: unknown, b: unknown): boolean {
  const left = toComparable(a);
  const right = toComparable(b);
  if (left === null || right === null) return left === right;
  return left === right;
}

function compare(a: unknown, b: unknown): number | null {
  const left = toComparable(a);
  const right = toComparable(b);
  if (left === null || right === null) return null;
  if (typeof left === "number" && typeof right === "number") return left - right;
  return String(left).localeCompare(String(right));
}

function matchesOperators(value: unknown, operators: FieldOperators<unknown>): boolean {
  if (operators.eq !== undefined) {
    if (operators.eq === null ? value !== null && value !== undefined : !looseEquals(value, operators.eq)) {
      return false;
    }
  }
  if (operators.ne !== undefined) {
    if (operators.ne === null ? value === null || value === undefined : looseEquals(value, operators.ne)) {
      return false;
    }
  }

  if (operators.gt !== undefined) {
    const result = compare(value, operators.gt);
    if (result === null || result <= 0) return false;
  }
  if (operators.gte !== undefined) {
    const result = compare(value, operators.gte);
    if (result === null || result < 0) return false;
  }
  if (operators.lt !== undefined) {
    const result = compare(value, operators.lt);
    if (result === null || result >= 0) return false;
  }
  if (operators.lte !== undefined) {
    const result = compare(value, operators.lte);
    if (result === null || result > 0) return false;
  }

  if (operators.like !== undefined) {
    if (value === null || value === undefined) return false;
    if (!likeToRegExp(operators.like).test(String(value))) return false;
  }
  if (operators.notLike !== undefined) {
    if (value !== null && value !== undefined && likeToRegExp(operators.notLike).test(String(value))) {
      return false;
    }
  }
  if (operators.ilike !== undefined) {
    if (value === null || value === undefined) return false;
    if (!likeToRegExp(operators.ilike, true).test(String(value))) return false;
  }

  if (operators.in !== undefined) {
    if (!operators.in.some((candidate) => looseEquals(value, candidate))) return false;
  }
  if (operators.notIn !== undefined) {
    if (operators.notIn.some((candidate) => looseEquals(value, candidate))) return false;
  }

  if (operators.between !== undefined) {
    const [from, to] = operators.between;
    const lower = compare(value, from);
    const upper = compare(value, to);
    if (lower === null || upper === null || lower < 0 || upper > 0) return false;
  }

  if (operators.isNull !== undefined) {
    const isNull = value === null || value === undefined;
    if (operators.isNull !== isNull) return false;
  }

  return true;
}

export function matchesFilter<T>(
  entity: T,
  filter: WhereFilter<T> | undefined,
  schema: EntitySchema<T>
): boolean {
  if (!filter) return true;

  for (const [key, condition] of Object.entries(filter)) {
    if (condition === undefined) continue;

    if (key === "$and") {
      if (!(condition as WhereFilter<T>[]).every((f) => matchesFilter(entity, f, schema))) return false;
      continue;
    }
    if (key === "$or") {
      const group = condition as WhereFilter<T>[];
      if (group.length > 0 && !group.some((f) => matchesFilter(entity, f, schema))) return false;
      continue;
    }
    if (key === "$not") {
      if (matchesFilter(entity, condition as WhereFilter<T>, schema)) return false;
      continue;
    }

    // Valida que la propiedad exista en el mapeo, igual que hace el compilador
    // de Oracle: un filtro con una propiedad inventada es un error, no un
    // silencioso "no casa nada".
    schema.columnOf(key);
    const value = (entity as Record<string, unknown>)[key];

    if (condition === null) {
      if (value !== null && value !== undefined) return false;
      continue;
    }

    if (isOperatorObject(condition)) {
      if (!matchesOperators(value, condition as FieldOperators<unknown>)) return false;
      continue;
    }

    if (!looseEquals(value, condition)) return false;
  }

  return true;
}

/** Ordenamiento estable equivalente al `ORDER BY` de SQL. */
export function compareBy(a: unknown, b: unknown, direction: "asc" | "desc" = "asc"): number {
  const left = toComparable(a);
  const right = toComparable(b);
  const factor = direction === "desc" ? -1 : 1;

  // Oracle ordena los NULL al final en ASC; replicamos ese comportamiento.
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;

  if (typeof left === "number" && typeof right === "number") {
    return (left - right) * factor;
  }
  return String(left).localeCompare(String(right)) * factor;
}
