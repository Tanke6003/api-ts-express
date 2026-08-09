// src/core/config/env.validation.ts
import type { IEnvs } from "../../domain/interfaces/infrastructure/plugins/envs.plugin.interface";

/**
 * Valida que los secretos críticos estén presentes al arrancar la aplicación.
 *
 * En vez de degradarse silenciosamente con valores por defecto inseguros, la app
 * falla de forma ruidosa (lanza un error) listando qué variables faltan.
 *
 * - `JWT_SECRET` es siempre obligatorio.
 * - Los secretos de base de datos solo se exigen para el driver configurado en
 *   `DATA_SOURCE`, para no obligar a definir credenciales de motores que no se
 *   están usando.
 */
export function validateCriticalEnvs(envs: IEnvs): void {
  const missing: string[] = [];

  if (!envs.getEnv("JWT_SECRET")) {
    missing.push("JWT_SECRET");
  }

  const dataSource = (envs.getEnv("DATA_SOURCE") || "dummy").toLowerCase();

  if (dataSource === "sqlserver") {
    if (!envs.getEnv("DB_PASSWORD")) {
      missing.push("DB_PASSWORD");
    }
  }

  if (dataSource === "oracle") {
    // El usuario y el connect string tienen valor por defecto alineado con el
    // docker-compose; la contraseña no puede tenerlo.
    if (!envs.getEnv("ORACLE_PASSWORD")) {
      missing.push("ORACLE_PASSWORD");
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `[config] Missing required environment variable(s): ${missing.join(", ")}. ` +
        "Refusing to start with insecure defaults. See docs/environment.md."
    );
  }
}
