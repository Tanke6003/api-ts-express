// src/infrastructure/repositories/base/sql.unit-of-work.ts
import type {
  ITransactionScope,
  IUnitOfWork,
} from "../../../../domain/interfaces/infrastructure/repositories/unit-of-work.interface";
import type { IGenericRepository } from "../../../../domain/interfaces/infrastructure/repositories/generic.repository.interface";
import type { ISqlExecutor } from "../../../../domain/interfaces/infrastructure/plugins/sql-executor.interface";
import type { ITransactionContext } from "../../../../domain/interfaces/infrastructure/plugins/transaction-context.plugin.interface";
import { SqlGenericRepository } from "../drivers/sql.generic.repository";

/**
 * Lo único que la unidad de trabajo necesita del driver: abrir una transacción
 * y entregar un executor atado a ella. Lo cumplen tanto `OraclePlugin` como
 * `SequelizeDbPlugin`.
 */
export interface ISqlTransactionRunner {
  transaction<T>(work: (tx: ISqlExecutor) => Promise<T>): Promise<T>;
}

/**
 * Registro heterogéneo de repositorios por nombre lógico de entidad. El tipo
 * concreto se recupera en `repository<T>()`, que es donde el llamador declara
 * qué entidad está pidiendo.
 */
export type SqlRepositoryRegistry = Map<string, SqlGenericRepository<never, never>>;

/**
 * Unidad de trabajo sobre SQL: una transacción real, con commit al terminar y
 * rollback si algo lanza.
 *
 * Dentro del bloque, `scope.repository(...)` devuelve el repositorio genérico de
 * siempre pero enlazado a la conexión de la transacción, así que el servicio usa
 * exactamente la misma API que fuera de ella.
 */
export class SqlUnitOfWork implements IUnitOfWork {
  constructor(
    private readonly db: ISqlTransactionRunner,
    private readonly repositories: SqlRepositoryRegistry,
    /**
     * Publica la transacción para que los repositorios de módulo se apunten a
     * ella sin recibirla por parámetro.
     */
    private readonly context?: ITransactionContext
  ) {}

  execute<R>(work: (scope: ITransactionScope) => Promise<R>): Promise<R> {
    return this.db.transaction(async (tx) => {
      // Memoizado por entidad: dos peticiones del mismo repositorio dentro de la
      // transacción devuelven la misma instancia.
      const bound = new Map<string, unknown>();

      const baseRepositoryOf = (entity: string): SqlGenericRepository<never, never> => {
        const repository = this.repositories.get(entity);
        if (!repository) {
          throw new Error(
            `[SqlUnitOfWork] La entidad "${entity}" no está registrada en la unidad de trabajo. ` +
              `Registradas: ${[...this.repositories.keys()].join(", ")}.`
          );
        }
        return repository;
      };

      const boundRepositoryOf = (entity: string): SqlGenericRepository<never, never> => {
        const cached = bound.get(entity);
        if (cached) return cached as SqlGenericRepository<never, never>;

        const rebound = baseRepositoryOf(entity).withExecutor(tx);
        bound.set(entity, rebound);
        return rebound;
      };

      const scope: ITransactionScope = {
        repository: <T extends object, TKey = number>(entity: string): IGenericRepository<T, TKey> =>
          boundRepositoryOf(entity) as unknown as IGenericRepository<T, TKey>,

        // El bloqueo va por el mismo executor que el resto de la transacción,
        // así que lo libera su commit o su rollback. La sentencia la escribe el
        // dialecto, que es donde vive lo que cambia entre motores.
        lockRow: (entity: string, id: unknown): Promise<boolean> =>
          boundRepositoryOf(entity).lockById(id as never),
      };

      // Dentro de este `run`, cualquier repositorio de módulo que consulte el
      // contexto usará la conexión de la transacción en lugar del pool.
      return this.context ? this.context.run(scope, () => work(scope)) : work(scope);
    });
  }
}
