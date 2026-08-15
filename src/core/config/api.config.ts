// src/core/config/api.config.ts
//
// Dónde se monta la API. Un solo sitio lo decide y todo lo demás lo consulta:
// el enrutador, la documentación y el propio endpoint de salud, que lo publica
// para que un cliente pueda descubrirlo sin que nadie se lo diga.
import type { IEnvs } from "../../domain/interfaces/infrastructure/plugins/envs.plugin.interface";

/** Prefijo por defecto de la versión vigente. */
export const DEFAULT_API_PREFIX = "/api/v1";

/**
 * Prefijo sin versión, que apunta a lo mismo. Existe para no romper a quien ya
 * llamaba a `/api/...`. Se desactiva poniendo `API_LEGACY_PREFIX=` vacío.
 */
export const DEFAULT_LEGACY_PREFIX = "/api";

/**
 * Normaliza un prefijo de montaje: con barra inicial, sin barra final.
 *
 * Devuelve `null` para una cadena vacía, que es como se dice "no montes esto".
 */
function normalizePrefix(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "/") return null;

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeadingSlash.replace(/\/+$/, "");
}

/**
 * Ruta donde se monta la versión vigente de la API (`API_PREFIX`).
 *
 * **Ojo con lo que significa cambiarla.** El prefijo identifica el contrato, no
 * el despliegue: `/api/v1` promete una forma concreta de petición y respuesta, y
 * quien la define es el código de `presentation/routes` y sus DTOs. Ponerle
 * `/api/v2` a este código no crea una versión 2, renombra la 1.
 *
 * El uso legítimo es mover la API de sitio —detrás de un proxy que la sirve en
 * `/servicio-citas/api/v1`, o convivir con otra app en el mismo dominio—.
 *
 * Cuando de verdad exista una v2, las dos tendrán que responder a la vez, así
 * que no saldrán de aquí sino de dos montajes en `index.route.ts`, cada uno con
 * su router:
 *
 *     app.use("/api/v1", v1);
 *     app.use("/api/v2", v2);
 */
export function resolveApiPrefix(envs: IEnvs): string {
  return normalizePrefix(envs.getEnv("API_PREFIX")) ?? DEFAULT_API_PREFIX;
}

/**
 * Alias sin versión, o `null` si no debe montarse.
 *
 * Se apaga con `API_LEGACY_PREFIX=off`, y no dejándolo vacío: `IEnvs.getEnv`
 * devuelve `""` tanto para una variable ausente como para una vacía, así que
 * "vacío" no puede significar "apágalo" sin que borrarla del fichero lo apagara
 * también por accidente.
 *
 * Si coincidiera con el prefijo principal también devuelve `null`: montar el
 * mismo router dos veces en la misma ruta duplicaría cada petición.
 */
export function resolveLegacyPrefix(envs: IEnvs): string | null {
  const configured = envs.getEnv("API_LEGACY_PREFIX").trim();
  if (configured.toLowerCase() === "off") return null;

  const legacy = normalizePrefix(configured) ?? DEFAULT_LEGACY_PREFIX;
  return legacy === resolveApiPrefix(envs) ? null : legacy;
}
