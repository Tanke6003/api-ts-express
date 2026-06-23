// src/core/config/env.validation.ts
import type { IEnvs } from "../../domain/interfaces/infrastructure/plugins/envs.plugin.interface";

/**
 * Valida que los secretos críticos estén presentes al arrancar la aplicación.
 *
 * En vez de degradarse silenciosamente con valores por defecto inseguros, la app
 * falla de forma ruidosa (lanza un error) listando qué variables faltan.
 *
 * - `JWT_SECRET` es siempre obligatorio.
 * - Los secretos de base de datos solo se exigen cuando `DATA_SOURCE=sqlserver`.
 */
export function validateCriticalEnvs(envs: IEnvs): void {
  const missing: string[] = [];

  if (!envs.getEnv("JWT_SECRET")) {
    missing.push("JWT_SECRET");
  }

  if ((envs.getEnv("DATA_SOURCE") || "dummy").toLowerCase() === "sqlserver") {
    if (!envs.getEnv("DB_PASSWORD")) {
      missing.push("DB_PASSWORD");
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `[config] Missing required environment variable(s): ${missing.join(", ")}. ` +
        "Refusing to start with insecure defaults. See docs/environment.md."
    );
  }
}
