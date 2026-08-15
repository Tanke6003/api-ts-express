// src/presentation/routing/route.decorators.ts
//
// Declaración de rutas sobre el propio controlador, al estilo de Angular o
// Nest: el método dice qué verbo sirve, en qué ruta, qué valida y qué responde,
// y de ahí salen a la vez el enrutado y la documentación.
//
// El objetivo no es ahorrarse el `app.get(...)` —eso son treinta líneas por
// módulo— sino que **la ruta, la validación y el OpenAPI dejen de escribirse
// tres veces**. Hoy el esquema de Zod dice que `limit` es un entero de 1 a 100,
// el bloque `@openapi` lo repite a mano y nada obliga a que coincidan; en
// cuanto uno cambia, el otro miente. Aquí sólo existe el esquema.
import type { RequestHandler } from "express";
import type { ZodType } from "zod";

export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

/** Tipo de un parámetro de ruta, para documentarlo. */
export type PathParamType = "integer" | "string";

/**
 * Una respuesta documentada.
 *
 * La forma corta es sólo la descripción, que basta para un 204 o para un error.
 * Cuando la respuesta lleva cuerpo hay dos maneras de describirlo:
 *
 * - `ref`: nombre de un componente ya declarado (`PaginatedUsers`). Es lo que
 *   usan las respuestas de éxito, porque su forma la define el DTO y no hay un
 *   esquema de Zod de salida del que derivarla.
 * - `schema`: un tipo de Zod, si lo hay. Se genera igual que el del cuerpo de
 *   la petición.
 */
export type ResponseSpec =
  | string
  | {
      description: string;
      /** Componente de `components.schemas`, sin el `#/...`. */
      ref?: string;
      schema?: ZodType;
    };

export interface RouteOptions {
  /** Una línea; es lo que se ve en la lista de Swagger. */
  summary?: string;
  description?: string;
  /** Esquema del cuerpo JSON. Se valida y se documenta con él. */
  body?: ZodType;
  /**
   * Cuerpo que no es JSON, descrito a mano.
   *
   * Existe para lo que Zod no puede representar y el servidor no valida con un
   * esquema: una subida `multipart/form-data`, que llega como un flujo. Sin
   * esto la documentación no declara cuerpo, y entonces Swagger y Scalar mandan
   * la petición sin `Content-Type` —ni selector de fichero— y el endpoint la
   * rechaza sin que se entienda por qué.
   */
  requestBody?: {
    mediaType: string;
    /** Esquema en JSON Schema, tal cual va al documento. */
    schema: Record<string, unknown>;
    required?: boolean;
    description?: string;
  };
  /** Esquema de la query. Cada propiedad se publica como un parámetro. */
  query?: ZodType;
  /** Parámetros de la ruta (`/users/:id` -> `{ id: "integer" }`). */
  params?: Record<string, PathParamType>;
  /** Códigos de respuesta y qué devuelven. */
  responses?: Record<number, ResponseSpec>;
  /**
   * Sin token. Por defecto **toda** ruta exige JWT: si abrir una es un
   * descuido, que el descuido sea cerrarla y no al revés.
   */
  public?: boolean;
  /**
   * Middlewares extra, entre la validación y el manejador.
   *
   * Admite una función porque un decorador se evalúa al cargar la clase, cuando
   * todavía no hay instancia: si el middleware depende de algo que se inyecta
   * —un limitador configurado por entorno, por ejemplo—, se pide aquí y el
   * constructor del router lo resuelve con la instancia ya montada.
   */
  use?: RequestHandler[] | ((controller: object) => RequestHandler[]);
}

export interface RouteMetadata extends RouteOptions {
  method: HttpMethod;
  path: string;
  /** Nombre de la propiedad del controlador que atiende la ruta. */
  handler: string;
}

export interface ControllerMetadata {
  prefix: string;
  tag?: string;
  /**
   * Token con el que el contenedor resuelve quién atiende.
   *
   * Va aquí para que montar la API sea recorrer el registro: sin él habría que
   * mantener a mano una tabla de clase a token, que es justo la lista que se
   * olvida de actualizar al añadir un módulo. La clase aporta las rutas; el
   * token, la implementación, que así se puede sustituir en un test.
   */
  token?: string;
  routes: RouteMetadata[];
}

/**
 * Metadatos por clase.
 *
 * Se indexa por el constructor y no por nombre para que dos controladores
 * homónimos en módulos distintos no se pisen.
 */
const REGISTRY = new Map<object, ControllerMetadata>();

function metadataOf(target: object): ControllerMetadata {
  let metadata = REGISTRY.get(target);
  if (!metadata) {
    metadata = { prefix: "", routes: [] };
    REGISTRY.set(target, metadata);
  }
  return metadata;
}

/**
 * Marca la clase como controlador HTTP y le da su prefijo.
 *
 * Los decoradores de método corren **antes** que el de clase, así que cuando
 * este llega la lista de rutas ya está poblada; por eso sólo completa el
 * prefijo en vez de crear la entrada.
 */
export function ApiController(prefix: string, options: { tag?: string; token?: string } = {}) {
  return function (target: new (...args: never[]) => object): void {
    const metadata = metadataOf(target);
    metadata.prefix = prefix;
    metadata.tag = options.tag;
    metadata.token = options.token;
  };
}

/**
 * Fábrica de los decoradores de verbo.
 *
 * Decora propiedades, no métodos del prototipo, porque los controladores de
 * este proyecto declaran sus manejadores como funciones flecha —así `this`
 * queda atado sin `.bind()`—. Un decorador de propiedad recibe el prototipo y
 * el nombre, que es todo lo que hace falta para registrar.
 */
function route(method: HttpMethod) {
  return (path: string, options: RouteOptions = {}) =>
    function (target: object, propertyKey: string | symbol): void {
      const constructor = (target as { constructor: object }).constructor;
      metadataOf(constructor).routes.push({
        ...options,
        method,
        path,
        handler: String(propertyKey),
      });
    };
}

export const Get = route("get");
export const Post = route("post");
export const Put = route("put");
export const Patch = route("patch");
export const Delete = route("delete");

/**
 * Une el prefijo del controlador con el de la ruta.
 *
 * Vive aquí, y no en cada constructor, para que el enrutado y la documentación
 * no puedan discrepar: `@Get("/")` sobre `/users` es `/users`, no `/users/`.
 * Express trata las dos como la misma, pero en el documento de OpenAPI serían
 * dos entradas distintas.
 */
export function joinPath(prefix: string, path: string): string {
  if (path === "" || path === "/") return prefix;
  return `${prefix}${path}`;
}

/**
 * Cuánto de concreto es un segmento de ruta. Cuanto más bajo, antes se prueba.
 *
 * Express recorre las rutas en el orden en que se registran y se queda con la
 * primera que case, así que `/:id` declarada antes que `/stats` se traga
 * "stats" y lo trata como un id.
 */
function segmentRank(segment: string): number {
  if (segment.startsWith(":")) return 1;
  if (segment.startsWith("*") || segment.startsWith("{")) return 2;
  return 0;
}

/**
 * Ordena de más concreta a más genérica, comparando segmento a segmento.
 *
 * Sustituye a la regla anterior —"el orden es el del código"—, que funcionaba
 * pero se rompía sola: bastaba con mover un método de sitio, o con que una
 * clase base declarara `/:id`, para que una ruta estática dejara de alcanzarse
 * y el síntoma fuera un 400 de "id inválido" en vez de un error claro.
 *
 * A igualdad se conserva el orden de declaración, porque `sort` es estable.
 */
export function bySpecificity(a: RouteMetadata, b: RouteMetadata): number {
  const left = a.path.split("/");
  const right = b.path.split("/");

  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const difference = segmentRank(left[i]) - segmentRank(right[i]);
    if (difference !== 0) return difference;
  }

  return 0;
}

/**
 * Rutas del controlador listas para montar: ordenadas por especificidad y con
 * los duplicados detectados.
 *
 * Dos rutas con el mismo verbo y el mismo camino son un error, no una
 * preferencia: Express se queda con la primera y la segunda no se ejecuta
 * jamás, en silencio. Aquí se convierte en un fallo al arrancar.
 */
export function sortedRoutes(metadata: ControllerMetadata, controllerName: string): RouteMetadata[] {
  const routes = [...metadata.routes].sort(bySpecificity);
  const seen = new Set<string>();

  for (const route of routes) {
    const signature = `${route.method.toUpperCase()} ${joinPath(metadata.prefix, route.path)}`;
    if (seen.has(signature)) {
      throw new Error(
        `[router] ${controllerName} declara ${signature} dos veces. ` +
          "Sólo se ejecutaría la primera."
      );
    }
    seen.add(signature);
  }

  return routes;
}

/** Metadatos de un controlador decorado, o `null` si no lo está. */
export function getControllerMetadata(target: object): ControllerMetadata | null {
  const metadata = REGISTRY.get(target);
  // Un prefijo vacío significa que alguien puso verbos pero olvidó la clase.
  if (!metadata) return null;
  return metadata;
}

/** Todos los controladores registrados. Lo usa el generador de OpenAPI. */
export function registeredControllers(): [object, ControllerMetadata][] {
  return [...REGISTRY.entries()];
}
