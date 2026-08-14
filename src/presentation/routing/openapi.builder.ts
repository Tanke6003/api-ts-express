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
import { joinPath, type ControllerMetadata, type RouteMetadata } from "./route.decorators";

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

/**
 * Respuestas declaradas más las que se cumplen siempre.
 *
 * El 401 no se escribe en cada ruta: lo pone el guard, así que lo pone también
 * la documentación en toda ruta que no sea pública.
 */
function responsesOf(route: RouteMetadata): Record<string, unknown> {
  const declared = Object.entries(route.responses ?? { 200: "OK" }).map(
    ([code, description]) => [code, { description }] as const
  );

  const responses = Object.fromEntries(declared) as Record<string, unknown>;
  if (!route.public && !responses["401"]) {
    responses["401"] = { description: "Falta el token o no es válido" };
  }
  return responses;
}

function operationOf(route: RouteMetadata, tag?: string): Record<string, unknown> {
  const parameters = [...pathParameters(route.params), ...(route.query ? queryParameters(route.query) : [])];

  return {
    ...(tag ? { tags: [tag] } : {}),
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
