// src/presentation/controllers/crud.controller.ts
import type { NextFunction, Request, Response } from "express";
import type { ICrudService, ListOptions } from "../../application/services/crud.service";
import type { IRequestContext } from "../../domain/interfaces/infrastructure/plugins/request-context.plugin.interface";
import { AppError } from "../../core/errors/app-error";
import { parseId } from "../utils/parse-id";
import { BaseController } from "./base.controller";

/** Contrato HTTP que `@Crud()` monta. Un módulo puede sustituir cualquiera. */
export interface ICrudController {
  list(req: Request, res: Response, next: NextFunction): Promise<void>;
  getOne(req: Request, res: Response, next: NextFunction): Promise<void>;
  create(req: Request, res: Response, next: NextFunction): Promise<void>;
  update(req: Request, res: Response, next: NextFunction): Promise<void>;
  softDelete(req: Request, res: Response, next: NextFunction): Promise<void>;
}

/** Query que el listado entiende sin que el módulo la traduzca. */
interface PagedQuery {
  page?: number;
  limit?: number;
  withDeleted?: boolean;
}

/**
 * Los cinco manejadores de un CRUD por HTTP, escritos una vez.
 *
 * Aquí vive lo que cada controlador repetía literalmente: el `try/catch` que
 * delega en el manejador global, el `parseId` que convierte `/users/abc` en un
 * 400 en vez de en una consulta absurda, el 404 cuando no hay fila y los
 * códigos de cada verbo.
 *
 * Las **rutas** no se declaran aquí sino con `@Crud()` sobre la clase concreta.
 * Un decorador puesto en esta base se registraría a nombre de la base y no del
 * módulo que la extiende, y además hay que poder elegir qué verbos se exponen.
 */
export abstract class CrudController extends BaseController implements ICrudController {
  protected constructor(
    private readonly service: ICrudService<unknown>,
    context: IRequestContext,
    /** Nombre del recurso en los mensajes: "usuario no encontrado". */
    protected readonly resource: string
  ) {
    super(context);
  }

  /**
   * Traduce lo que ya validó el esquema de la ruta.
   *
   * La query entera baja al servicio: la paginación la entiende este
   * controlador, y lo demás —una búsqueda, un filtro propio— lo interpreta
   * `CrudService.buildWhere`, que es donde vive esa decisión.
   */
  private paging(req: Request): { page: number; limit: number; options: ListOptions } {
    const query = (req.validatedQuery as PagedQuery | undefined) ?? {};

    return {
      page: query.page ?? 1,
      limit: query.limit ?? 10,
      options: { withDeleted: query.withDeleted, query },
    };
  }

  private notFound(): AppError {
    return new AppError(`No se encontró ${this.resource} con ese id`, 404, true, {
      code: "NOT_FOUND",
    });
  }

  public list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { page, limit, options } = this.paging(req);
      res.json(await this.service.list(page, limit, options));
    } catch (error) {
      next(error);
    }
  };

  public getOne = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const found = await this.service.get(parseId(req.params.id, this.resource));
      if (!found) throw this.notFound();

      res.json(found);
    } catch (error) {
      next(error);
    }
  };

  public create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Devuelve el recurso creado, no un acuse: el cliente necesita la PK que
      // acaba de generar la base, y pedirla con otro GET sobra.
      res.status(201).json(await this.service.create(req.body));
    } catch (error) {
      next(error);
    }
  };

  public update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const updated = await this.service.update(parseId(req.params.id, this.resource), req.body);
      if (!updated) throw this.notFound();

      res.json(updated);
    } catch (error) {
      next(error);
    }
  };

  public softDelete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const deleted = await this.service.softDelete(parseId(req.params.id, this.resource));
      if (!deleted) throw this.notFound();

      res.status(204).send();
    } catch (error) {
      next(error);
    }
  };
}
