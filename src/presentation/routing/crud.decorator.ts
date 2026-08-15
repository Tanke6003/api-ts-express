// src/presentation/routing/crud.decorator.ts
import type { ZodType } from "zod";
import { Delete, Get, Post, Put, type RouteOptions } from "./route.decorators";

/** Los cinco verbos que `CrudController` implementa. */
export type CrudVerb = "list" | "getOne" | "create" | "update" | "softDelete";

const ALL_VERBS: CrudVerb[] = ["list", "getOne", "create", "update", "softDelete"];

export interface CrudOptions {
  /** Nombre del recurso, en singular, para los textos: "el usuario". */
  resource: string;
  /** Componente de OpenAPI de un elemento. `Paginated<dto>` para la página. */
  dto: string;
  /** Nombre del componente de la página, si no sigue la convención. */
  paged?: string;
  /** Esquemas de Zod: validan y documentan. */
  schemas?: { create?: ZodType; update?: ZodType; query?: ZodType };
  /** Verbos a exponer. Por defecto los cinco. */
  verbs?: CrudVerb[];
}

/**
 * Monta las rutas del CRUD sobre la clase que ya extiende `CrudController`.
 *
 * Va como decorador de clase y no en la base por dos razones. Una, práctica: un
 * decorador escrito en la base se registraría a nombre de la base, y el módulo
 * que la extiende no expondría ninguna ruta. Otra, de diseño: qué verbos se
 * abren es una decisión de cada módulo, y aquí se lee de un vistazo.
 *
 * Para quedarse con un verbo propio, se saca de `verbs` y se declara a mano con
 * su decorador. Declararlo **sin** sacarlo es un error, y salta al arrancar: el
 * detector de rutas duplicadas avisa de que hay dos para el mismo camino.
 */
export function Crud(options: CrudOptions) {
  const {
    resource,
    dto,
    paged = `Paginated${dto}`,
    schemas = {},
    verbs = ALL_VERBS,
  } = options;

  const has = (verb: CrudVerb): boolean => verbs.includes(verb);
  const idParam = { id: "integer" } as const;
  const notFound = `No existe ${resource} con ese id`;

  return function (target: new (...args: never[]) => object): void {
    // Se aplican los decoradores de ruta como si estuvieran escritos en la
    // clase; el prototipo es lo que esperan como `target`.
    const on = (route: (path: string, options?: RouteOptions) => PropertyDecorator) =>
      (path: string, routeOptions: RouteOptions, handler: CrudVerb) =>
        route(path, routeOptions)(target.prototype as object, handler);

    if (has("list")) {
      on(Get)(
        "/",
        {
          summary: `Listado paginado: ${resource}`,
          ...(schemas.query ? { query: schemas.query } : {}),
          responses: { 200: { description: "Página de resultados", ref: paged } },
        },
        "list"
      );
    }

    if (has("getOne")) {
      on(Get)(
        "/:id",
        {
          summary: `Obtiene ${resource} por id`,
          params: idParam,
          responses: { 200: { description: "Encontrado", ref: dto }, 404: notFound },
        },
        "getOne"
      );
    }

    if (has("create")) {
      on(Post)(
        "/",
        {
          summary: `Crea ${resource}`,
          ...(schemas.create ? { body: schemas.create } : {}),
          responses: {
            201: { description: "Creado", ref: dto },
            400: "Error de validación",
          },
        },
        "create"
      );
    }

    if (has("update")) {
      on(Put)(
        "/:id",
        {
          summary: `Actualiza ${resource}`,
          params: idParam,
          ...(schemas.update ? { body: schemas.update } : {}),
          responses: { 200: { description: "Actualizado", ref: dto }, 404: notFound },
        },
        "update"
      );
    }

    if (has("softDelete")) {
      on(Delete)(
        "/:id",
        {
          summary: `Baja lógica: ${resource}`,
          params: idParam,
          responses: { 204: "Dado de baja", 404: notFound },
        },
        "softDelete"
      );
    }
  };
}
