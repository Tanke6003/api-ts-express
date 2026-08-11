// src/infrastructure/repositories/base/audit-trail.ts
import type {
  AuditEntry,
  IAuditTrail,
} from "../../../domain/interfaces/infrastructure/repositories/audit-trail.interface";
import type { IGenericRepository } from "../../../domain/interfaces/infrastructure/repositories/generic.repository.interface";
import type { ISqlExecutor } from "../../../domain/interfaces/infrastructure/plugins/sql-executor.interface";
import type { IAuditLog } from "../../../domain/models/audit-log.model";
import { SqlGenericRepository } from "./drivers/sql.generic.repository";

/** Tope del detalle serializado, para no llenar la tabla con payloads enormes. */
const MAX_CHANGES_LENGTH = 4000;

function serialize(changes?: Record<string, unknown>): string | null {
  if (!changes) return null;

  const json = JSON.stringify(changes, (_key, value) =>
    value instanceof Date ? value.toISOString() : value
  );

  if (!json) return null;
  return json.length > MAX_CHANGES_LENGTH ? `${json.slice(0, MAX_CHANGES_LENGTH - 3)}...` : json;
}

/**
 * Construye la fila de bitácora. Se comparte entre implementaciones para que
 * memoria y SQL registren exactamente lo mismo.
 */
function toRow(entry: AuditEntry): Partial<IAuditLog> {
  return {
    entity: entry.entity,
    entityId: entry.entityId === undefined || entry.entityId === null ? null : String(entry.entityId),
    action: entry.action,
    changedBy: entry.actor.changedBy,
    requestId: entry.actor.requestId,
    changes: serialize(entry.changes),
  };
}

/**
 * Bitácora sobre una base SQL.
 *
 * Escribe por el mismo executor que la operación auditada, así que dentro de
 * una transacción entra en el mismo commit y desaparece con el rollback.
 */
export class SqlAuditTrail implements IAuditTrail {
  constructor(private readonly repository: SqlGenericRepository<IAuditLog>) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.repository.insert(toRow(entry));
  }

  bindTo(executor: ISqlExecutor): IAuditTrail {
    return new SqlAuditTrail(
      this.repository.withExecutor(executor) as SqlGenericRepository<IAuditLog>
    );
  }
}

/** Bitácora en memoria, para el modo sin base de datos y para los tests. */
export class MemoryAuditTrail implements IAuditTrail {
  constructor(private readonly repository: IGenericRepository<IAuditLog>) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.repository.insert(toRow(entry));
  }

  /** En memoria no hay transacciones por conexión: la misma instancia sirve. */
  bindTo(): IAuditTrail {
    return this;
  }
}
