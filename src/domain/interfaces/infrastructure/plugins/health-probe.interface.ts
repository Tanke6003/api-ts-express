// src/domain/interfaces/infrastructure/plugins/health-probe.interface.ts

/** Estado del proceso de cara a un balanceador o a un orquestador. */
export interface HealthReport {
  /** `true` si la instancia puede atender tráfico ahora mismo. */
  ready: boolean;
  /** Motor activo, tal y como lo resolvió `DATA_SOURCE`. */
  dataSource: string;
  /** `not_applicable` en memoria, donde no hay conexión que comprobar. */
  database: "up" | "down" | "not_applicable";
  /** `true` mientras se drena tras recibir SIGTERM. */
  shuttingDown: boolean;
}

/**
 * Sondeo de salud.
 *
 * Separa las dos preguntas que un orquestador hace y que no significan lo
 * mismo: si el proceso está vivo —y por tanto no hay que reiniciarlo— y si
 * puede recibir tráfico. Un proceso con la base caída está vivo pero no está
 * listo; reiniciarlo no arreglaría nada, quitarle el tráfico sí.
 */
export interface IHealthProbe {
  /** Comprueba la dependencia y devuelve el estado completo. */
  report(): Promise<HealthReport>;
  /** Marca que empezó el apagado: a partir de aquí nunca se está listo. */
  beginShutdown(): void;
}
