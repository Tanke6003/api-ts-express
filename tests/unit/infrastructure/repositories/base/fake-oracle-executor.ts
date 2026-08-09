// tests/unit/infrastructure/repositories/base/fake-oracle-executor.ts
import type {
  IOracleExecutor,
  OracleBinds,
  OracleExecuteResult,
} from "../../../../../src/domain/interfaces/infrastructure/plugins/oracle.plugin.interface";

export interface RecordedCall {
  sql: string;
  binds: OracleBinds;
}

/**
 * Executor de mentira: registra el SQL generado y devuelve respuestas
 * preparadas. Permite comprobar exactamente qué sentencia y qué binds produce el
 * repositorio genérico sin necesidad de una base de datos.
 */
export class FakeOracleExecutor implements IOracleExecutor {
  readonly calls: RecordedCall[] = [];
  private readonly responses: OracleExecuteResult[] = [];

  /** Encola la respuesta de la siguiente llamada a `execute`. */
  queue(response: Partial<OracleExecuteResult>): this {
    this.responses.push({
      rows: response.rows ?? [],
      rowsAffected: response.rowsAffected ?? 0,
      outBinds: response.outBinds ?? {},
    });
    return this;
  }

  async execute<TRow = Record<string, unknown>>(
    sql: string,
    binds: OracleBinds = {}
  ): Promise<OracleExecuteResult<TRow>> {
    this.calls.push({ sql, binds });
    const next = this.responses.shift();
    return (next ?? { rows: [], rowsAffected: 0, outBinds: {} }) as OracleExecuteResult<TRow>;
  }

  async executeMany(sql: string, binds: Record<string, unknown>[]): Promise<number> {
    this.calls.push({ sql, binds });
    return binds.length;
  }

  /** SQL de la última llamada, con los espacios normalizados. */
  get lastSql(): string {
    return (this.calls.at(-1)?.sql ?? "").replace(/\s+/g, " ").trim();
  }

  get lastBinds(): Record<string, unknown> {
    return (this.calls.at(-1)?.binds ?? {}) as Record<string, unknown>;
  }

  sqlAt(index: number): string {
    return (this.calls[index]?.sql ?? "").replace(/\s+/g, " ").trim();
  }
}

export const silentLogger = {
  log: jest.fn(),
  http: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
} as never;
