// src/application/dtos/dto.registry.ts
//
// Los DTOs se describen una vez, con Zod, y de ahí salen las dos cosas que
// antes se escribían por separado: el tipo de TypeScript (`z.infer`) y el
// componente de OpenAPI.
//
// Antes eran una interfaz más un bloque `@openapi` que la repetía en YAML —168
// líneas de comentario en los tres ficheros de DTOs—, sin nada que obligara a
// que coincidieran. Añadir un campo al DTO y olvidarlo en el comentario no
// rompía nada: sólo dejaba la documentación mintiendo.
import { z } from "zod";

/**
 * Registro de los DTOs que se publican como componentes.
 *
 * Zod resuelve solo las referencias entre ellos: si un DTO registrado contiene
 * a otro registrado, el segundo sale como `$ref` en vez de copiado, que es
 * justo lo que hace legible un documento de OpenAPI.
 */
const registry = z.registry<{ id: string }>();

/**
 * Declara un DTO y lo publica en `components.schemas` con ese nombre.
 *
 * Devuelve el mismo esquema, así que se usa en la declaración:
 *
 *     export const userDto = defineDto("User", z.object({ ... }));
 *     export type UserDTO = z.infer<typeof userDto>;
 */
export function defineDto<T extends z.ZodType>(id: string, schema: T): T {
  registry.add(schema, { id });
  return schema;
}

/**
 * Envuelve un DTO en la respuesta paginada de la casa.
 *
 * La forma de la página es la misma en todos los módulos, así que se declara
 * aquí y no en cada uno; el elemento va por referencia.
 */
export function definePagedDto<T extends z.ZodType>(id: string, item: T) {
  return defineDto(
    id,
    z.object({
      data: z.array(item),
      total: z.int().meta({ description: "Total de registros que cumplen el filtro" }),
      page: z.int(),
      limit: z.int(),
      pages: z.int(),
    })
  );
}

/**
 * Quita el ruido que JSON Schema añade y OpenAPI no necesita.
 *
 * `$schema` y `$id` sobran dentro de `components`, y los límites que Zod pone a
 * un entero —los enteros seguros de JavaScript— llenan la documentación de
 * números de dieciséis cifras que no dicen nada.
 */
const SAFE_INTEGER_BOUNDS = new Set([Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER]);

function clean(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(clean);
  if (node === null || typeof node !== "object") return node;

  const source = node as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(source)) {
    if (key === "$schema" || key === "$id") continue;
    if (
      (key === "minimum" || key === "maximum") &&
      typeof value === "number" &&
      SAFE_INTEGER_BOUNDS.has(value)
    ) {
      continue;
    }
    result[key] = clean(value);
  }

  return result;
}

/** Componentes de OpenAPI de todos los DTOs declarados. */
export function buildDtoComponents(): Record<string, unknown> {
  // Modo `output`: un DTO describe lo que la API **devuelve**.
  const { schemas } = z.toJSONSchema(registry, {
    io: "output",
    uri: (id) => `#/components/schemas/${id}`,
  }) as { schemas: Record<string, unknown> };

  return clean(schemas) as Record<string, unknown>;
}
