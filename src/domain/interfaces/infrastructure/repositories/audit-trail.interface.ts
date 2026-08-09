// src/domain/interfaces/infrastructure/repositories/audit-trail.interface.ts
import type { AuditAction } from "../../../models/audit-log.model";
import type { ISqlExecutor } from "../plugins/sql-executor.interface";

/**
 * Quién hizo el cambio, capturado al **empezar** la operación.
 *
 * No se lee en el momento de registrar: para entonces ya se han hecho
 * varios viajes a la base, y un pool puede resolver sus callbacks en el
 * contexto en el que se creó, no en el de la petición. La identidad se toma
 * antes del primer await y se arrastra.
 */
export interface AuditActor {
  changedBy: string;
  requestId: string | null;
}

export interface AuditEntry {
  entity: string;
  actor: AuditActor;
  entityId?: unknown;
  action: AuditAction;
  /**
   * Detalle de la operación. En un update lleva `{ before, after }`; en un
   * insert, los valores escritos; en una operación masiva, el filtro y cuántas
   * filas afectó.
   */
  changes?: Record<string, unknown>;
}

/**
 * Bitácora de cambios.
 *
 * La escribe el repositorio genérico después de cada operación de escritura, de
 * modo que ningún servicio tiene que acordarse de registrar nada.
 *
 * Se escribe por el mismo *executor* que la operación auditada: dentro de una
 * transacción entra en el mismo commit, y si la transacción se revierte la
 * línea de bitácora desaparece con ella. Un fallo al registrar hace fallar la
 * operación —una bitácora que pierde entradas en silencio no sirve para
 * auditar—.
 */
export interface IAuditTrail {
  record(entry: AuditEntry): Promise<void>;

  /** Copia que escribe por el executor de una transacción en curso. */
  bindTo(executor: ISqlExecutor): IAuditTrail;
}
