// tests/unit/infrastructure/repositories/base/fake-sql-executor.ts
import type {
  ISqlExecutor,
  SqlExecuteOptions,
  SqlExecuteResult,
} from "../../../../../src/domain/interfaces/infrastructure/plugins/sql-executor.interface";

export interface RecordedCall {
  sql: string;
  binds: Record<string, unknown> | Record<string, unknown>[];
  /** Qué esperaba el repositorio de la sentencia: filas o filas afectadas. */
  expects?: SqlExecuteOptions["expects"];
}

/**
 * Executor de mentira: registra el SQL generado y devuelve respuestas
 * preparadas. Permite comprobar exactamente qué sentencia y qué binds produce el
 * repositorio genérico sin necesidad de una base de datos.
 */
export class FakeSqlExecutor implements ISqlExecutor {
  readonly calls: RecordedCall[] = [];
  private readonly responses: SqlExecuteResult[] = [];

  /** Encola la respuesta de la siguiente llamada a `execute`. */
  queue(response: Partial<SqlExecuteResult>): this {
    this.responses.push({
      rows: response.rows ?? [],
      rowsAffected: response.rowsAffected ?? 0,
      outBinds: response.outBinds ?? {},
    });
    return this;
  }

  async execute<TRow = Record<string, unknown>>(
    sql: string,
    binds: Record<string, unknown> = {},
    options: SqlExecuteOptions = {}
  ): Promise<SqlExecuteResult<TRow>> {
    this.calls.push({ sql, binds, expects: options.expects });
    const next = this.responses.shift();
    return (next ?? { rows: [], rowsAffected: 0, outBinds: {} }) as SqlExecuteResult<TRow>;
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
