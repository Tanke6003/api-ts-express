// src/application/mapping/mapper.ts

/**
 * Mapeo declarativo entidad <-> DTO, en la línea de los perfiles de AutoMapper.
 *
 * Sustituye los `toDTO` / `toModel` / `toPartialModel` que cada servicio
 * repetía a mano. Se declara una vez qué propiedad del DTO sale de qué
 * propiedad de la entidad y, con eso, se obtienen las cuatro direcciones:
 *
 *   toDTO            entidad  -> DTO
 *   toDTOList        entidades -> DTOs
 *   toEntity         DTO      -> entidad completa
 *   toPartialEntity  DTO parcial -> sólo las claves presentes (para un PUT/PATCH)
 *
 * `toPartialEntity` es la que más código ahorra: distinguir "no vino" de "vino
 * como null" es justo el detalle que se olvida al escribirlo a mano y acaba
 * borrando campos que nadie pidió cambiar.
 */

/** Campo del DTO que se calcula y, por tanto, no vuelve a la entidad. */
export interface ComputedField<TEntity, TValue> {
  computed: (entity: TEntity) => TValue;
}

/** Campo del DTO con nombre distinto en la entidad y/o conversión de tipo. */
export interface MappedField<TEntity, TValue> {
  field: Extract<keyof TEntity, string>;
  /** Conversión entidad -> DTO. Por defecto, el valor tal cual. */
  to?: (value: unknown, entity: TEntity) => TValue;
  /** Conversión DTO -> entidad. Por defecto, el valor tal cual. */
  from?: (value: TValue) => unknown;
  /** `true` para campos que sólo se leen (no se escriben de vuelta). */
  readOnly?: boolean;
}

export type FieldMapping<TEntity, TValue> =
  | Extract<keyof TEntity, string>
  | MappedField<TEntity, TValue>
  | ComputedField<TEntity, TValue>;

/** Un mapeo por cada propiedad del DTO. */
export type MappingProfile<TEntity, TDto> = {
  [K in keyof TDto]-?: FieldMapping<TEntity, TDto[K]>;
};

export interface Mapper<TEntity, TDto> {
  toDTO(entity: TEntity): TDto;
  toDTOList(entities: TEntity[]): TDto[];
  /** DTO completo -> entidad. Útil al crear. */
  toEntity(dto: TDto): Partial<TEntity>;
  /** DTO parcial -> entidad, saltando las claves ausentes. Útil al actualizar. */
  toPartialEntity(dto: Partial<TDto>): Partial<TEntity>;
  readonly profile: MappingProfile<TEntity, TDto>;
}

function isComputed<TEntity, TValue>(
  mapping: FieldMapping<TEntity, TValue>
): mapping is ComputedField<TEntity, TValue> {
  return typeof mapping === "object" && "computed" in mapping;
}

function isMapped<TEntity, TValue>(
  mapping: FieldMapping<TEntity, TValue>
): mapping is MappedField<TEntity, TValue> {
  return typeof mapping === "object" && "field" in mapping;
}

/**
 * Construye un mapeador a partir de su perfil.
 *
 * @example
 * const branchMapper = createMapper<IBranch, BranchDTO>({
 *   id: "pkBranch",
 *   name: "name",
 *   address: "address",
 *   available: { field: "available", readOnly: true },
 * });
 */
export function createMapper<TEntity extends object, TDto extends object>(
  profile: MappingProfile<TEntity, TDto>
): Mapper<TEntity, TDto> {
  const entries = Object.entries(profile) as [
    Extract<keyof TDto, string>,
    FieldMapping<TEntity, unknown>,
  ][];

  // Sólo los campos que vuelven a la entidad: los calculados y los readOnly
  // quedan fuera de las dos direcciones de escritura.
  const writable = entries.filter(
    ([, mapping]) => !isComputed(mapping) && !(isMapped(mapping) && mapping.readOnly)
  );

  const toDTO = (entity: TEntity): TDto => {
    const dto: Record<string, unknown> = {};
    const source = entity as Record<string, unknown>;

    for (const [dtoKey, mapping] of entries) {
      if (isComputed(mapping)) {
        dto[dtoKey] = mapping.computed(entity);
        continue;
      }

      if (isMapped(mapping)) {
        const value = source[mapping.field];
        dto[dtoKey] = mapping.to
          ? (mapping.to as (v: unknown, e: TEntity) => unknown)(value, entity)
          : value;
        continue;
      }

      dto[dtoKey] = source[mapping];
    }

    return dto as TDto;
  };

  const writeEntity = (dto: Partial<TDto>, skipUndefined: boolean): Partial<TEntity> => {
    const entity: Record<string, unknown> = {};
    const source = dto as Record<string, unknown>;

    for (const [dtoKey, mapping] of writable) {
      const value = source[dtoKey];
      // `undefined` significa "no vino en el cuerpo"; `null` sí es un valor y
      // debe llegar a la entidad para poder limpiar una columna.
      if (skipUndefined && value === undefined) continue;

      const property = isMapped(mapping) ? mapping.field : (mapping as string);
      entity[property] =
        isMapped(mapping) && mapping.from
          ? (mapping.from as (v: unknown) => unknown)(value)
          : value;
    }

    return entity as Partial<TEntity>;
  };

  return {
    profile,
    toDTO,
    toDTOList: (entities) => entities.map(toDTO),
    toEntity: (dto) => writeEntity(dto, false),
    toPartialEntity: (dto) => writeEntity(dto, true),
  };
}
