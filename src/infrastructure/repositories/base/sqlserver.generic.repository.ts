// src/infrastructure/repositories/base/sqlserver.generic.repository.ts
import type { ISqlExecutor } from "../../../domain/interfaces/infrastructure/plugins/sql-executor.interface";
import type { ILogger } from "../../../domain/interfaces/infrastructure/plugins/logger.plugin.interface";
import type { IRequestContext } from "../../../domain/interfaces/infrastructure/plugins/request-context.plugin.interface";
import { EntityMetadata } from "./entity-metadata";
import { SqlGenericRepository } from "./sql.generic.repository";
import { sqlServerDialect } from "./sql.dialect";

/**
 * Repositorio genérico sobre SQL Server: la misma implementación común que
 * Oracle, con el dialecto de SQL Server.
 *
 * Difiere en dos cosas: la PK generada se recupera con `OUTPUT INSERTED` —que,
 * a diferencia de `SCOPE_IDENTITY()`, no depende del ámbito de la sesión— y la
 * fecha del servidor es `SYSDATETIME()`.
 */
export class SqlServerGenericRepository<
  T extends object,
  TKey = number,
> extends SqlGenericRepository<T, TKey> {
  constructor(
    db: ISqlExecutor,
    metadata: EntityMetadata<T>,
    logger: ILogger,
    context?: IRequestContext
  ) {
    super(db, metadata, logger, sqlServerDialect, context);
  }

  override withExecutor(executor: ISqlExecutor): SqlServerGenericRepository<T, TKey> {
    return new SqlServerGenericRepository<T, TKey>(
      executor,
      this.metadata,
      this.logger,
      this.context
    );
  }
}
