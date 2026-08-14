// src/infrastructure/plugins/healthProbe.plugin.ts
import type {
  HealthReport,
  IHealthProbe,
} from "../../domain/interfaces/infrastructure/plugins/health-probe.interface";

/** Lo único que el sondeo necesita de la conexión: preguntarle si responde. */
export interface IConnectionCheck {
  authenticate(): Promise<void>;
}

export interface HealthProbeOptions {
  /**
   * Ausente en memoria, donde no hay nada que abrir ni comprobar. Entonces la
   * instancia está lista siempre que no se esté apagando.
   */
  connection?: IConnectionCheck;
  dataSource: string;
  /**
   * Cuánto vale un resultado antes de volver a preguntar. Un balanceador sondea
   * cada pocos segundos y con varias réplicas eso es carga real contra la base;
   * la caché la convierte en un goteo constante e independiente del tráfico.
   */
  ttlMs?: number;
  /**
   * Tope de espera del sondeo. Sin él, una base que acepta la conexión pero no
   * responde deja la comprobación colgada, y el orquestador acaba decidiendo por
   * su propio timeout, mucho más tarde de lo que debería.
   */
  timeoutMs?: number;
}

const DEFAULT_TTL_MS = 3000;
const DEFAULT_TIMEOUT_MS = 2000;

/**
 * Sondeo de salud con caché corta y tope de espera.
 *
 * No lanza nunca: un fallo al comprobar *es* la respuesta —la base no está—, no
 * un error que propagar.
 */
export class HealthProbePlugin implements IHealthProbe {
  private readonly ttlMs: number;
  private readonly timeoutMs: number;
  private shuttingDown = false;
  private cached?: { at: number; database: HealthReport["database"] };

  constructor(private readonly options: HealthProbeOptions) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  beginShutdown(): void {
    this.shuttingDown = true;
    // La respuesta cacheada diría que todo va bien; el drenaje tiene que verse
    // en el siguiente sondeo, no cuando caduque la caché.
    this.cached = undefined;
  }

  async report(): Promise<HealthReport> {
    const database = await this.checkDatabase();

    return {
      ready: !this.shuttingDown && database !== "down",
      dataSource: this.options.dataSource,
      database,
      shuttingDown: this.shuttingDown,
    };
  }

  private async checkDatabase(): Promise<HealthReport["database"]> {
    if (!this.options.connection) return "not_applicable";

    const now = Date.now();
    if (this.cached && now - this.cached.at < this.ttlMs) return this.cached.database;

    const database = (await this.withTimeout()) ? "up" : "down";
    this.cached = { at: now, database };
    return database;
  }

  private async withTimeout(): Promise<boolean> {
    let timer: NodeJS.Timeout | undefined;

    try {
      await Promise.race([
        this.options.connection!.authenticate(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`[HealthProbe] la base no respondió en ${this.timeoutMs} ms`)),
            this.timeoutMs
          );
        }),
      ]);
      return true;
    } catch {
      return false;
    } finally {
      // Sin esto, el temporizador perdedor mantiene vivo el bucle de eventos y
      // retrasa la salida del proceso justo cuando se está apagando.
      if (timer) clearTimeout(timer);
    }
  }
}
