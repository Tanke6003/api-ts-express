// src/infrastructure/repositories/base/entity-metadata.ts

/**
 * Mapeo entidad <-> tabla, al estilo del `ModelBuilder` de EF Core pero sin
 * decoradores: los modelos del dominio siguen siendo interfaces puras y aquí,
 * en infraestructura, se declara cómo se persisten.
 *
 * Con esta descripción, `OracleGenericRepository` y `MemoryGenericRepository`
 * saben generar todo el CRUD sin una línea de SQL escrita a mano.
 */

export type ColumnKind = "number" | "string" | "boolean" | "date";

export interface ColumnMetadata {
  /** Nombre físico de la columna. */
  name: string;
  /** Tipo lógico; gobierna las conversiones JS <-> BD. Por defecto "string". */
  kind?: ColumnKind;
  /** `false` para columnas que la base calcula (p.ej. IDENTITY). */
  insertable?: boolean;
  /** `false` para columnas inmutables (p.ej. CREATED_AT). */
  updatable?: boolean;
}

/** Atajo: si sólo se da el nombre, el resto toma los valores por defecto. */
export type ColumnDefinition = string | ColumnMetadata;

export interface SoftDeleteMetadata<T> {
  property: Extract<keyof T, string>;
  /** Valor que marca "vivo". Por defecto `1`. */
  activeValue?: unknown;
  /** Valor que marca "borrado". Por defecto `0`. */
  deletedValue?: unknown;
}

export interface TimestampMetadata<T> {
  createdAt?: Extract<keyof T, string>;
  updatedAt?: Extract<keyof T, string>;
}

export interface EntityMetadata<T> {
  table: string;
  primaryKey: Extract<keyof T, string>;
  /** `true` (por defecto) si la PK la genera la base: IDENTITY o secuencia. */
  identity?: boolean;
  columns: Record<Extract<keyof T, string>, ColumnDefinition>;
  /** Si se omite, la entidad no soporta borrado lógico. */
  softDelete?: SoftDeleteMetadata<T>;
  timestamps?: TimestampMetadata<T>;
}

/**
 * Helper de identidad: existe sólo para que TypeScript infiera `T` y valide que
 * `columns` cubre todas las propiedades del modelo.
 */
export function defineEntity<T>(metadata: EntityMetadata<T>): EntityMetadata<T> {
  return metadata;
}

/**
 * Vista normalizada de `EntityMetadata`: resuelve los atajos, indexa por columna
 * y centraliza las conversiones de tipo entre la fila de la base y la entidad.
 */
export class EntitySchema<T> {
  private readonly byProperty = new Map<string, ColumnMetadata>();
  private readonly propertyByColumn = new Map<string, string>();

  constructor(public readonly metadata: EntityMetadata<T>) {
    for (const [property, definition] of Object.entries(metadata.columns) as [
      string,
      ColumnDefinition,
    ][]) {
      const column: ColumnMetadata =
        typeof definition === "string" ? { name: definition } : { ...definition };

      column.kind = column.kind ?? "string";
      column.insertable = column.insertable ?? true;
      column.updatable = column.updatable ?? true;

      this.byProperty.set(property, column);
      // Oracle devuelve los identificadores en mayúsculas; indexamos así para
      // poder resolver la fila sin depender de cómo la escribió el SELECT.
      this.propertyByColumn.set(column.name.toUpperCase(), property);
    }
  }

  get table(): string {
    return this.metadata.table;
  }

  get primaryKey(): Extract<keyof T, string> {
    return this.metadata.primaryKey;
  }

  get isIdentity(): boolean {
    return this.metadata.identity !== false;
  }

  get softDelete(): SoftDeleteMetadata<T> | undefined {
    return this.metadata.softDelete;
  }

  get softDeleteActiveValue(): unknown {
    return this.metadata.softDelete?.activeValue ?? 1;
  }

  get softDeleteDeletedValue(): unknown {
    return this.metadata.softDelete?.deletedValue ?? 0;
  }

  get timestamps(): TimestampMetadata<T> | undefined {
    return this.metadata.timestamps;
  }

  get properties(): Extract<keyof T, string>[] {
    return [...this.byProperty.keys()] as Extract<keyof T, string>[];
  }

  has(property: string): boolean {
    return this.byProperty.has(property);
  }

  /**
   * Nombre de columna de una propiedad. Lanza si la propiedad no está mapeada:
   * es la barrera que impide que un nombre arbitrario llegue al SQL generado.
   */
  columnOf(property: string): string {
    const column = this.byProperty.get(property);
    if (!column) {
      throw new Error(
        `[EntitySchema] La propiedad "${property}" no está mapeada en ${this.table}. ` +
          `Propiedades válidas: ${this.properties.join(", ")}.`
      );
    }
    return column.name;
  }

  kindOf(property: string): ColumnKind {
    return this.byProperty.get(property)?.kind ?? "string";
  }

  isInsertable(property: string): boolean {
    return this.byProperty.get(property)?.insertable ?? false;
  }

  isUpdatable(property: string): boolean {
    return this.byProperty.get(property)?.updatable ?? false;
  }

  /** Propiedades que se pueden escribir en un INSERT (la PK IDENTITY queda fuera). */
  insertableProperties(): Extract<keyof T, string>[] {
    return this.properties.filter(
      (p) => this.isInsertable(p) && !(this.isIdentity && p === this.primaryKey)
    );
  }

  updatableProperties(): Extract<keyof T, string>[] {
    return this.properties.filter((p) => this.isUpdatable(p) && p !== this.primaryKey);
  }

  /** Convierte un valor de la entidad al formato que espera la base. */
  toColumnValue(property: string, value: unknown): unknown {
    if (value === undefined || value === null) return null;

    switch (this.kindOf(property)) {
      case "boolean":
        return value ? 1 : 0;
      case "number":
        return typeof value === "number" ? value : Number(value);
      case "date":
        return value instanceof Date ? value : new Date(String(value));
      default:
        return value;
    }
  }

  /** Convierte un valor de la base al tipo del modelo. */
  toEntityValue(property: string, value: unknown): unknown {
    if (value === undefined || value === null) return null;

    switch (this.kindOf(property)) {
      case "boolean":
        return value === 1 || value === "1" || value === true;
      case "number":
        return typeof value === "number" ? value : Number(value);
      case "date":
        return value instanceof Date ? value : new Date(String(value));
      case "string":
        return typeof value === "string" ? value : String(value);
      default:
        return value;
    }
  }

  /**
   * Mapea una fila cruda (claves = nombres de columna) a la entidad del dominio.
   * Las columnas ausentes —por ejemplo con una proyección— simplemente no se
   * incluyen, en lugar de aparecer como `undefined`.
   */
  toEntity(row: Record<string, unknown>): T {
    const entity: Record<string, unknown> = {};

    for (const [rawColumn, rawValue] of Object.entries(row)) {
      const property = this.propertyByColumn.get(rawColumn.toUpperCase());
      if (!property) continue;
      entity[property] = this.toEntityValue(property, rawValue);
    }

    return entity as T;
  }
}
