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
  "contains",
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
  const escaped = escapeRegExp(pattern);
  const translated = escaped.replace(/%/g, ".*").replace(/_/g, ".");
  return new RegExp(`^${translated}$`, caseInsensitive ? "i" : "");
}

/** Deja un texto listo para ir dentro de una expresión regular como literal. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Carácter de escape de los `LIKE` que genera el compilador SQL.
 *
 * Se usa `!` y no la barra invertida porque MySQL la trata como escape dentro
 * del propio literal de cadena: un `ESCAPE '\'` en el SQL le llega como una
 * comilla escapada y rompe la sentencia, mientras que `!` no significa nada
 * especial en ninguno de los cuatro motores.
 */
export const LIKE_ESCAPE = "!";

/**
 * Convierte texto literal en un patrón LIKE que casa con "lo contiene".
 *
 * Los comodines y el propio carácter de escape se neutralizan, así que buscar
 * `100%` busca exactamente eso y no "cualquier cosa que empiece por 100".
 */
export function containsPattern(value: string): string {
  const escaped = value.replace(
    new RegExp(`[${LIKE_ESCAPE}%_]`, "g"),
    (match) => `${LIKE_ESCAPE}${match}`
  );
  return `%${escaped}%`;
}
