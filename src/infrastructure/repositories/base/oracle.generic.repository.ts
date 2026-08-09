// src/infrastructure/repositories/base/oracle.generic.repository.ts
import type { ISqlExecutor } from "../../../domain/interfaces/infrastructure/plugins/sql-executor.interface";
import type { ILogger } from "../../../domain/interfaces/infrastructure/plugins/logger.plugin.interface";
import type { IRequestContext } from "../../../domain/interfaces/infrastructure/plugins/request-context.plugin.interface";
import { EntityMetadata } from "./entity-metadata";
import { SqlGenericRepository } from "./sql.generic.repository";
import { oracleDialect } from "./sql.dialect";

/**
 * Repositorio genérico sobre Oracle: la implementación común
 * (`SqlGenericRepository`) con el dialecto de Oracle ya puesto.
 *
 * Lo único propio del motor es cómo se recupera la PK generada
 * (`RETURNING ... INTO`) y la expresión de fecha del servidor (`SYSTIMESTAMP`).
 */
export class OracleGenericRepository<T extends object, TKey = number> extends SqlGenericRepository<
  T,
  TKey
> {
  constructor(
    db: ISqlExecutor,
    metadata: EntityMetadata<T>,
    logger: ILogger,
    context?: IRequestContext
  ) {
    super(db, metadata, logger, oracleDialect, context);
  }

  override withExecutor(executor: ISqlExecutor): OracleGenericRepository<T, TKey> {
    return new OracleGenericRepository<T, TKey>(
      executor,
      this.metadata,
      this.logger,
      this.context
    );
  }
}
