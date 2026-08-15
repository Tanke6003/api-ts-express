// src/main.ts
import "reflect-metadata";
import "./core/di/container";

import { container, shutdownConnections, warmUpConnections } from "./core/di/container";
import { Server } from "./core/server";
import { TOKENS } from "./core/di/tokens";
import type { IEnvs } from "./domain/interfaces/infrastructure/plugins/envs.plugin.interface";
import type { ILogger } from "./domain/interfaces/infrastructure/plugins/logger.plugin.interface";
import type { IHealthProbe } from "./domain/interfaces/infrastructure/plugins/health-probe.interface";

const envs = container.resolve<IEnvs>(TOKENS.IEnvs);
const logger = container.resolve<ILogger>(TOKENS.ILogger);

const toInt = (raw: string, fallback: number): number => {
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
};

const port = toInt(envs.getEnv("PORT"), 3000) || 3000;

/**
 * Margen entre dejar de estar listo y dejar de escuchar.
 *
 * Es el paso que de verdad quita los 502 de un despliegue rolling: el
 * balanceador tarda un poco en enterarse de que esta instancia ya no acepta
 * tráfico, y si se cierra el puerto antes de que se entere, lo que mande
 * mientras tanto se pierde. En Kubernetes suele bastar con 5000.
 */
const shutdownDelayMs = toInt(envs.getEnv("SHUTDOWN_DELAY_MS"), 0);

/** Tope del apagado entero. Debe ser menor que el plazo del orquestador. */
const shutdownTimeoutMs = toInt(envs.getEnv("SHUTDOWN_TIMEOUT_MS"), 10_000) || 10_000;

const server = new Server(port);

void (async () => {
  // Verifica la base antes de aceptar tráfico: un fallo de credenciales o de
  // red se ve aquí y no en la primera petición del usuario.
  try {
    await warmUpConnections();
  } catch (error) {
    logger.error("No se pudo establecer la conexión con la base de datos", { error });
    process.exit(1);
  }

  await server.run();
})().catch((error) => {
  // Sin esto, un fallo al abrir el puerto sale como "unhandled rejection" y el
  // proceso muere sin dejar una línea de log que explique por qué.
  logger.error("El servidor no pudo arrancar", { error });
  process.exit(1);
});

// ------------------------------------------------------- apagado ordenado ---

let shuttingDown = false;

const wait = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

/**
 * Apagado en cuatro pasos, en este orden:
 *
 *  1. Dejar de estar listo, para que el balanceador deje de mandar tráfico.
 *  2. Esperar a que se entere.
 *  3. Dejar de escuchar y terminar lo que hubiera en vuelo.
 *  4. Devolver el pool de la base.
 *
 * Con un temporizador de rescate por encima: si algo se queda colgado, el
 * proceso sale igual, pero con código 1 para que se note en el log del
 * orquestador en vez de aparecer como una salida limpia.
 */
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) {
    logger.warn("Señal de apagado repetida, ya se estaba drenando", { signal });
    return;
  }
  shuttingDown = true;

  logger.info("Apagando", { signal, shutdownDelayMs, shutdownTimeoutMs });

  const watchdog = setTimeout(() => {
    logger.error("El apagado excedió su plazo; se fuerza la salida", { shutdownTimeoutMs });
    process.exit(1);
  }, shutdownTimeoutMs);
  // Que el temporizador no sea lo único que mantiene vivo el proceso.
  watchdog.unref();

  try {
    container.resolve<IHealthProbe>(TOKENS.IHealthProbe).beginShutdown();
    await wait(shutdownDelayMs);

    await server.close();
    logger.info("Servidor cerrado, sin peticiones en vuelo");

    await shutdownConnections();
    logger.info("Conexiones devueltas. Adiós");

    clearTimeout(watchdog);
    process.exit(0);
  } catch (error) {
    logger.error("Fallo durante el apagado", { error });
    clearTimeout(watchdog);
    process.exit(1);
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => void shutdown(signal));
}
