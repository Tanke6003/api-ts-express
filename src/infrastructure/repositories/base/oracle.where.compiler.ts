// src/infrastructure/repositories/base/oracle.where.compiler.ts
import type {
  FieldOperators,
  WhereFilter,
} from "../../../domain/interfaces/infrastructure/repositories/generic.repository.interface";
import { EntitySchema } from "./entity-metadata";
import { isOperatorObject } from "./filter.helpers";

export interface CompiledWhere {
  /** Cuerpo del WHERE sin la palabra clave; cadena vacía si no hay condiciones. */
  sql: string;
  binds: Record<string, unknown>;
}

/**
 * Traduce un `WhereFilter<T>` a SQL de Oracle.
 *
 * Dos invariantes de seguridad:
 *  - los nombres de columna salen siempre de `EntitySchema.columnOf`, que lanza
 *    si la propiedad no está mapeada, así que nada arbitrario llega al SQL;
 *  - los valores nunca se interpolan, siempre se enlazan como binds nombrados.
 *
 * Cada compilador es de un solo uso: acumula sus binds internamente.
 */
export class OracleWhereCompiler<T> {
  private index = 0;
  private readonly binds: Record<string, unknown> = {};

  /**
   * @param prefix Prefijo de los binds. Se usa para que un UPDATE pueda mezclar
   * los binds del SET y los del WHERE sin pisarse.
   */
  constructor(
    private readonly schema: EntitySchema<T>,
    private readonly prefix = "w"
  ) {}

  compile(filter?: WhereFilter<T>): CompiledWhere {
    const sql = filter ? this.compileFilter(filter) : "";
    return { sql, binds: this.binds };
  }

  private bind(property: string, value: unknown): string {
    const name = `${this.prefix}${this.index++}`;
    this.binds[name] = this.schema.toColumnValue(property, value);
    return `:${name}`;
  }

  private compileFilter(filter: WhereFilter<T>): string {
    const parts: string[] = [];

    for (const [key, value] of Object.entries(filter)) {
      if (value === undefined) continue;

      if (key === "$and") {
        const group = (value as WhereFilter<T>[])
          .map((f) => this.compileFilter(f))
          .filter(Boolean);
        if (group.length > 0) parts.push(`(${group.join(" AND ")})`);
        continue;
      }

      if (key === "$or") {
        const group = (value as WhereFilter<T>[])
          .map((f) => this.compileFilter(f))
          .filter(Boolean);
        if (group.length > 0) parts.push(`(${group.join(" OR ")})`);
        continue;
      }

      if (key === "$not") {
        const inner = this.compileFilter(value as WhereFilter<T>);
        if (inner) parts.push(`NOT (${inner})`);
        continue;
      }

      const condition = this.compileField(key, value);
      if (condition) parts.push(condition);
    }

    return parts.join(" AND ");
  }

  private compileField(property: string, condition: unknown): string {
    const column = this.schema.columnOf(property);

    if (condition === null) return `${column} IS NULL`;
    if (!isOperatorObject(condition)) return `${column} = ${this.bind(property, condition)}`;

    const operators = condition as FieldOperators<unknown>;
    const parts: string[] = [];

    if (operators.eq !== undefined) {
      parts.push(
        operators.eq === null
          ? `${column} IS NULL`
          : `${column} = ${this.bind(property, operators.eq)}`
      );
    }
    if (operators.ne !== undefined) {
      parts.push(
        operators.ne === null
          ? `${column} IS NOT NULL`
          : `${column} <> ${this.bind(property, operators.ne)}`
      );
    }
    if (operators.gt !== undefined) parts.push(`${column} > ${this.bind(property, operators.gt)}`);
    if (operators.gte !== undefined) parts.push(`${column} >= ${this.bind(property, operators.gte)}`);
    if (operators.lt !== undefined) parts.push(`${column} < ${this.bind(property, operators.lt)}`);
    if (operators.lte !== undefined) parts.push(`${column} <= ${this.bind(property, operators.lte)}`);

    if (operators.like !== undefined) {
      parts.push(`${column} LIKE ${this.bind(property, operators.like)}`);
    }
    if (operators.notLike !== undefined) {
      parts.push(`${column} NOT LIKE ${this.bind(property, operators.notLike)}`);
    }
    if (operators.ilike !== undefined) {
      parts.push(`UPPER(${column}) LIKE UPPER(${this.bind(property, operators.ilike)})`);
    }

    if (operators.in !== undefined) {
      // Una lista vacía no puede casar con nada; `1 = 0` lo expresa sin generar
      // el `IN ()` que Oracle rechazaría.
      parts.push(
        operators.in.length === 0
          ? "1 = 0"
          : `${column} IN (${operators.in.map((v) => this.bind(property, v)).join(", ")})`
      );
    }
    if (operators.notIn !== undefined) {
      parts.push(
        operators.notIn.length === 0
          ? "1 = 1"
          : `${column} NOT IN (${operators.notIn.map((v) => this.bind(property, v)).join(", ")})`
      );
    }

    if (operators.between !== undefined) {
      const [from, to] = operators.between;
      parts.push(`${column} BETWEEN ${this.bind(property, from)} AND ${this.bind(property, to)}`);
    }

    if (operators.isNull !== undefined) {
      parts.push(operators.isNull ? `${column} IS NULL` : `${column} IS NOT NULL`);
    }

    return parts.length > 1 ? `(${parts.join(" AND ")})` : parts.join("");
  }
}
