// src/infrastructure/repositories/base/query/mongo.filter.ts
import type {
  FieldOperators,
  WhereFilter,
} from "../../../../domain/interfaces/infrastructure/repositories/generic.repository.interface";
import { EntitySchema } from "../entity-metadata";
import { escapeRegExp, isOperatorObject, likeToRegExp } from "./filter.helpers";

/**
 * Traduce el mismo `WhereFilter<T>` que `SqlWhereCompiler` lleva a SQL y
 * `matchesFilter` evalúa en memoria, esta vez a un documento de consulta de
 * MongoDB. Mantener las tres implementaciones alineadas es lo que permite que un
 * módulo se escriba una vez y funcione contra cualquiera de los cinco motores.
 *
 * Dos invariantes, iguales a las del compilador SQL:
 *  - los nombres de campo salen siempre de `EntitySchema.columnOf`, que lanza si
 *    la propiedad no está mapeada, así que nada arbitrario llega a la consulta;
 *  - los valores pasan por `toColumnValue`, de modo que un booleano del modelo
 *    se compara contra el 1/0 que hay guardado y una fecha viaja como `Date`.
 */

/** Documento de consulta tal y como lo espera el driver. */
export type MongoQuery = Record<string, unknown>;

function isNotEmpty(query: MongoQuery): boolean {
  return Object.keys(query).length > 0;
}

/**
 * Une condiciones con AND.
 *
 * No se fusionan en un solo objeto a propósito: dos condiciones sobre el mismo
 * campo compartirían clave y una pisaría a la otra. `$and` es explícito y no
 * tiene ese riesgo.
 */
function and(parts: MongoQuery[]): MongoQuery {
  if (parts.length === 0) return {};
  if (parts.length === 1) return parts[0];
  return { $and: parts };
}

/**
 * Condiciones de un campo. Devuelve una lista porque un mismo campo puede
 * necesitar más de un documento: `{ gte: 1, between: [5, 9] }` produciría dos
 * `$gte` y en un único objeto sólo sobreviviría el último.
 */
function compileField<T>(
  schema: EntitySchema<T>,
  property: string,
  condition: unknown
): MongoQuery[] {
  const field = schema.columnOf(property);
  const value = (raw: unknown): unknown => schema.toColumnValue(property, raw);

  // Un `null` suelto (`{ tag: null }`) es IS NULL. `$eq: null` alcanza también a
  // los documentos que ni siquiera tienen el campo, que es lo que un motor SQL
  // entiende por "columna sin valor".
  if (condition === null) return [{ [field]: { $eq: null } }];
  if (!isOperatorObject(condition)) return [{ [field]: { $eq: value(condition) } }];

  const operators = condition as FieldOperators<unknown>;
  const groups: Record<string, unknown>[] = [];

  /** Coloca el operador en el primer grupo que no lo tenga ya ocupado. */
  const put = (operator: string, operand: unknown): void => {
    const slot = groups.find((group) => !(operator in group));
    if (slot) slot[operator] = operand;
    else groups.push({ [operator]: operand });
  };

  if (operators.eq !== undefined) put("$eq", value(operators.eq));
  if (operators.ne !== undefined) put("$ne", value(operators.ne));
  if (operators.gt !== undefined) put("$gt", value(operators.gt));
  if (operators.gte !== undefined) put("$gte", value(operators.gte));
  if (operators.lt !== undefined) put("$lt", value(operators.lt));
  if (operators.lte !== undefined) put("$lte", value(operators.lte));

  // El patrón LIKE se reutiliza tal cual: `likeToRegExp` ya escapa los
  // metacaracteres, así que un `%` del usuario no se convierte en un regex
  // arbitrario. `ilike` es el mismo patrón con la bandera de insensibilidad.
  if (operators.like !== undefined) put("$regex", likeToRegExp(operators.like));
  if (operators.ilike !== undefined) put("$regex", likeToRegExp(operators.ilike, true));
  if (operators.notLike !== undefined) put("$not", likeToRegExp(operators.notLike));

  // Subcadena literal. El texto se escapa entero antes de llegar al `$regex`:
  // sin eso, un `%%%%%` del formulario se traduciría a `.*.*.*.*.*` y sería una
  // regex patológica ejecutándose dentro del servidor de MongoDB.
  if (operators.contains !== undefined) {
    put("$regex", new RegExp(escapeRegExp(operators.contains), "i"));
  }

  // Una lista vacía en `in` no casa con nada, que es justo lo que hace `$in: []`
  // sin necesidad de una condición constante como la que exige el SQL.
  if (operators.in !== undefined) put("$in", operators.in.map((item) => value(item)));
  if (operators.notIn !== undefined) put("$nin", operators.notIn.map((item) => value(item)));

  if (operators.between !== undefined) {
    const [from, to] = operators.between;
    put("$gte", value(from));
    put("$lte", value(to));
  }

  if (operators.isNull !== undefined) put(operators.isNull ? "$eq" : "$ne", null);

  return groups.map((group) => ({ [field]: group }));
}

export function toMongoFilter<T>(
  filter: WhereFilter<T> | undefined,
  schema: EntitySchema<T>
): MongoQuery {
  if (!filter) return {};

  const parts: MongoQuery[] = [];

  for (const [key, condition] of Object.entries(filter)) {
    if (condition === undefined) continue;

    if (key === "$and") {
      const group = (condition as WhereFilter<T>[])
        .map((inner) => toMongoFilter(inner, schema))
        .filter(isNotEmpty);
      if (group.length > 0) parts.push(and(group));
      continue;
    }

    if (key === "$or") {
      const group = (condition as WhereFilter<T>[])
        .map((inner) => toMongoFilter(inner, schema))
        .filter(isNotEmpty);
      // Un `$or: []` es un error para el servidor; un grupo vacío no aporta
      // condición, igual que en los otros dos traductores.
      if (group.length > 0) parts.push({ $or: group });
      continue;
    }

    if (key === "$not") {
      const inner = toMongoFilter(condition as WhereFilter<T>, schema);
      // MongoDB no tiene un `$not` de primer nivel —sólo dentro de un campo—,
      // así que se usa `$nor` con un único miembro, que es su negación exacta.
      if (isNotEmpty(inner)) parts.push({ $nor: [inner] });
      continue;
    }

    parts.push(...compileField(schema, key, condition));
  }

  return and(parts);
}
