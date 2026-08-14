// src/presentation/routing/openapi.builder.ts
//
// OpenAPI a partir de los metadatos de las rutas y de los esquemas de Zod.
//
// Es la mitad que hace que los decoradores valgan la pena. Sin esto se ahorra
// el `app.get(...)` y poco más, porque en los ficheros de rutas de este
// proyecto entre el 71 % y el 77 % de las líneas eran el bloque `@openapi`
// escrito a mano: la misma información que ya estaba en el validador, repetida
// sin nada que garantizara que coincidían.
import { z, type ZodType } from "zod";
import {
  joinPath,
  type ControllerMetadata,
  type ResponseSpec,
  type RouteMetadata,
} from "./route.decorators";

/** Documento de OpenAPI, en lo que a este generador respecta. */
type OpenApiPaths = Record<string, Record<string, unknown>>;

/**
 * Esquema JSON de un tipo de Zod.
 *
 * Siempre en modo `input`: la documentación describe lo que **manda** el
 * cliente, no lo que el validador devuelve después de sus transformaciones. Es
 * además el único modo que funciona con un `.transform()` —el de salida no
 * puede representarlos— y varios esquemas de query lo usan para convertir la
 * cadena de la URL a número.
 */
function toSchema(schema: ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { io: "input" }) as Record<string, unknown>;
  // `$schema` es correcto en un documento suelto pero ruido dentro de OpenAPI.
  delete json.$schema;
  return json;
}

/** `/users/:id` -> `/users/{id}`, que es como los escribe OpenAPI. */
function toOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

/** Un parámetro por cada propiedad del esquema de query. */
function queryParameters(schema: ZodType): Record<string, unknown>[] {
  const json = toSchema(schema);
  const properties = (json.properties ?? {}) as Record<string, Record<string, unknown>>;
  const required = new Set((json.required as string[] | undefined) ?? []);

  return Object.entries(properties).map(([name, propertySchema]) => ({
    in: "query",
    name,
    required: required.has(name),
    schema: propertySchema,
    ...(propertySchema.description ? { description: propertySchema.description } : {}),
  }));
}

function pathParameters(params: RouteMetadata["params"]): Record<string, unknown>[] {
  return Object.entries(params ?? {}).map(([name, type]) => ({
    in: "path",
    name,
    required: true,
    schema: { type },
  }));
}

/** Nombre del componente con el sobre de error común de la API. */
export const ERROR_SCHEMA_NAME = "ErrorResponse";

/**
 * Forma de **cualquier** error de la API.
 *
 * La produce un único sitio —el manejador global— así que se declara una vez y
 * se referencia desde todas las respuestas 4xx y 5xx. Antes no estaba
 * documentada en ninguna parte: un cliente veía "401 Unauthorized" y tenía que
 * adivinar que el cuerpo trae un `code` estable sobre el que ramificar.
 */
export const ERROR_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    status: { type: "string", const: "error" },
    code: {
      type: "string",
      description: "Código estable; es sobre lo que conviene ramificar.",
      examples: ["VALIDATION_ERROR", "NO_TOKEN", "APPOINTMENT_OVERLAP"],
    },
    message: { type: "string" },
    requestId: {
      type: "string",
      description: "Mismo valor que la cabecera X-Request-Id. Sirve para el soporte.",
    },
    timestamp: { type: "string", format: "date-time" },
    path: { type: "string" },
    method: { type: "string" },
    errors: {
      type: "array",
      description: "Sólo en errores de validación: qué campo y por qué.",
      items: {
        type: "object",
        properties: { field: { type: "string" }, message: { type: "string" } },
        required: ["field", "message"],
      },
    },
  },
  required: ["status", "code", "message", "timestamp", "path", "method"],
} as const;

const errorContent = {
  content: { "application/json": { schema: { $ref: `#/components/schemas/${ERROR_SCHEMA_NAME}` } } },
};

/** Cuerpo de una respuesta, sea por referencia a un componente o generado. */
function contentOf(spec: Exclude<ResponseSpec, string>): Record<string, unknown> {
  if (spec.ref) {
    return {
      content: {
        "application/json": { schema: { $ref: `#/components/schemas/${spec.ref}` } },
      },
    };
  }
  if (spec.schema) {
    return { content: { "application/json": { schema: toSchema(spec.schema) } } };
  }
  return {};
}

/**
 * Respuestas declaradas más las que se cumplen siempre.
 *
 * Dos cosas se añaden solas, porque son ciertas en toda la API y repetirlas en
 * cada ruta sólo daría ocasión de olvidarlas:
 *
 *  - el 401 en cualquier ruta que pase por el guard;
 *  - el cuerpo de error en todo 4xx y 5xx que no describa otro.
 */
function responsesOf(route: RouteMetadata): Record<string, unknown> {
  const declared: Record<string, unknown> = {};

  for (const [code, spec] of Object.entries(route.responses ?? { 200: "OK" })) {
    const normalized = typeof spec === "string" ? { description: spec } : spec;
    declared[code] = { description: normalized.description, ...contentOf(normalized) };
  }

  if (!route.public && !declared["401"]) {
    declared["401"] = { description: "Falta el token o no es válido" };
  }

  for (const [code, response] of Object.entries(declared)) {
    const isFailure = Number(code) >= 400;
    const hasContent = "content" in (response as Record<string, unknown>);
    if (isFailure && !hasContent) {
      declared[code] = { ...(response as Record<string, unknown>), ...errorContent };
    }
  }

  return declared;
}

function operationOf(route: RouteMetadata, tag?: string): Record<string, unknown> {
  const parameters = [...pathParameters(route.params), ...(route.query ? queryParameters(route.query) : [])];

  return {
    ...(tag ? { tags: [tag] } : {}),
    // El nombre del manejador ya identifica la operación y es único dentro del
    // controlador. Es lo que usan los generadores de cliente para nombrar el
    // método, y sin él inventan uno a partir de la ruta y el verbo.
    operationId: route.handler,
    ...(route.summary ? { summary: route.summary } : {}),
    ...(route.description ? { description: route.description } : {}),
    ...(route.public ? {} : { security: [{ bearerAuth: [] }] }),
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(route.body
      ? {
          requestBody: {
            required: true,
            content: { "application/json": { schema: toSchema(route.body) } },
          },
        }
      : {}),
    responses: responsesOf(route),
  };
}

/**
 * Construye el bloque `paths` de todos los controladores decorados.
 *
 * Dos rutas con el mismo camino y distinto verbo comparten entrada, que es como
 * lo espera OpenAPI.
 */
export function buildOpenApiPaths(controllers: ControllerMetadata[]): OpenApiPaths {
  const paths: OpenApiPaths = {};

  for (const controller of controllers) {
    for (const route of controller.routes) {
      const path = toOpenApiPath(joinPath(controller.prefix, route.path));
      paths[path] ??= {};
      paths[path][route.method] = operationOf(route, controller.tag);
    }
  }

  return paths;
}
