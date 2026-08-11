// src/infrastructure/repositories/base/filter.helpers.ts
import type {
  FieldOperators,
  OrderByClause,
} from "../../../../domain/interfaces/infrastructure/repositories/generic.repository.interface";

/** Claves reconocidas como operadores dentro de un filtro de campo. */
export const OPERATOR_KEYS = new Set([
  "eq",
  "ne",
  "gt",
  "gte",
  "lt",
  "lte",
  "like",
  "notLike",
  "ilike",
  "in",
  "notIn",
  "between",
  "isNull",
]);

/**
 * Distingue `{ age: { gte: 18 } }` (operadores) de `{ createdAt: someDate }`
 * (igualdad directa). Un `Date` o un array son valores, nunca operadores; un
 * objeto plano sólo cuenta como operadores si todas sus claves lo son.
 */
export function isOperatorObject(value: unknown): value is FieldOperators<unknown> {
  if (value === null || typeof value !== "object") return false;
  if (value instanceof Date || Array.isArray(value)) return false;

  const keys = Object.keys(value as object);
  // `{}` se acepta como "sin condición" en vez de compararse contra un objeto.
  return keys.every((key) => OPERATOR_KEYS.has(key));
}

/** Acepta una cláusula suelta o un array y siempre devuelve un array. */
export function normalizeOrderBy<T>(
  orderBy?: OrderByClause<T> | OrderByClause<T>[]
): OrderByClause<T>[] {
  if (!orderBy) return [];
  return Array.isArray(orderBy) ? orderBy : [orderBy];
}

/**
 * Traduce un patrón LIKE de SQL (`%`, `_`) a una expresión regular anclada,
 * escapando antes cualquier metacarácter para que el patrón no se interprete
 * como regex.
 */
export function likeToRegExp(pattern: string, caseInsensitive = false): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const translated = escaped.replace(/%/g, ".*").replace(/_/g, ".");
  return new RegExp(`^${translated}$`, caseInsensitive ? "i" : "");
}
