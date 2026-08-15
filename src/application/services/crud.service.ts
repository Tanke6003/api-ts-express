// src/application/services/crud.service.ts
import type {
  IGenericRepository,
  OrderByClause,
  QueryOptions,
} from "../../domain/interfaces/infrastructure/repositories/generic.repository.interface";
import type { PaginatedDTO } from "../dtos/common.dtos";
import { AppError } from "../../core/errors/app-error";

/** Lo que el CRUD genérico necesita de un mapeador (ver `mapping/mapper.ts`). */
export interface EntityMapper<T, TDto> {
  toDTO(entity: T): TDto;
  toDTOList(entities: T[]): TDto[];
  toEntity(dto: Partial<TDto>): Partial<T>;
  toPartialEntity(dto: Partial<TDto>): Partial<T>;
}

/** Contrato que consume `CrudController`. */
export interface ICrudService<TDto> {
  list(page: number, limit: number, options?: ListOptions): Promise<PaginatedDTO<TDto>>;
  get(id: number): Promise<TDto | null>;
  create(dto: Partial<TDto>): Promise<TDto>;
  update(id: number, dto: Partial<TDto>): Promise<TDto | null>;
  softDelete(id: number): Promise<boolean>;
}

export interface ListOptions {
  withDeleted?: boolean;
  /** Filtro ya compuesto por quien llama; el CRUD genérico no lo interpreta. */
  where?: unknown;
}

/**
 * CRUD de un módulo, escrito una vez.
 *
 * Es el mismo movimiento que hizo `SqlGenericRepository` con la base de datos,
 * una capa más arriba: allí se describía la tabla y salía el CRUD sin SQL, aquí
 * se aporta el repositorio y el mapeador y sale el CRUD sin repetir el pase a
 * través que todos los servicios planos escribían igual.
 *
 * **Lo que no hace: reglas de negocio.** Un módulo con reglas —comprobar un
 * solape, cancelar en cascada— sobrescribe el verbo que las tenga y conserva
 * los demás. Si un servicio tuviera que retorcerse para encajar aquí, la
 * respuesta correcta es no extender esta clase.
 */
export abstract class CrudService<T extends object, TDto> implements ICrudService<TDto> {
  protected constructor(
    protected readonly repository: IGenericRepository<T>,
    protected readonly mapper: EntityMapper<T, TDto>,
    /** Orden por defecto del listado; sin él, el de la PK. */
    protected readonly defaultOrderBy?: OrderByClause<T>
  ) {}

  async list(page: number, limit: number, options: ListOptions = {}): Promise<PaginatedDTO<TDto>> {
    const query: Omit<QueryOptions<T>, "skip" | "take"> = {
      where: options.where as QueryOptions<T>["where"],
      withDeleted: options.withDeleted,
      orderBy: this.defaultOrderBy,
    };

    const paged = await this.repository.getPaged(page, limit, query);

    return {
      data: this.mapper.toDTOList(paged.items),
      total: paged.total,
      page: paged.page,
      limit: paged.limit,
      pages: paged.pages,
    };
  }

  async get(id: number): Promise<TDto | null> {
    const entity = await this.repository.getById(id as never);
    return entity ? this.mapper.toDTO(entity) : null;
  }

  async create(dto: Partial<TDto>): Promise<TDto> {
    // La PK la genera la base: el mapeador la trata como sólo lectura, así que
    // no llega desde el cuerpo de la petición.
    const created = await this.repository.insert(this.mapper.toEntity(dto));
    if (!created) throw new AppError("No se pudo crear el registro", 500);

    return this.mapper.toDTO(created);
  }

  async update(id: number, dto: Partial<TDto>): Promise<TDto | null> {
    // Parcial: el mapeador salta las claves que no vinieron, para que un PUT
    // incompleto no borre lo que nadie pidió cambiar.
    const updated = await this.repository.update(id as never, this.mapper.toPartialEntity(dto));
    return updated ? this.mapper.toDTO(updated) : null;
  }

  softDelete(id: number): Promise<boolean> {
    return this.repository.softDelete(id as never);
  }
}
