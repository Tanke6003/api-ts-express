// src/infrastructure/repositories/base/oracle.unit-of-work.ts
import type {
  ITransactionScope,
  IUnitOfWork,
} from "../../../domain/interfaces/infrastructure/repositories/unit-of-work.interface";
import type { IGenericRepository } from "../../../domain/interfaces/infrastructure/repositories/generic.repository.interface";
import type { IOracleConnectionPlugin } from "../../../domain/interfaces/infrastructure/plugins/oracle.plugin.interface";
import { OracleGenericRepository } from "./oracle.generic.repository";

/**
 * Registro heterogéneo de repositorios por nombre lógico de entidad. El tipo
 * concreto se recupera en `repository<T>()`, que es donde el llamador declara
 * qué entidad está pidiendo.
 */
export type OracleRepositoryRegistry = Map<string, OracleGenericRepository<never, never>>;

/**
 * Unidad de trabajo sobre Oracle: una transacción real, con commit al terminar
 * y rollback si algo lanza.
 *
 * Dentro del bloque, `scope.repository(...)` devuelve el repositorio genérico de
 * siempre pero enlazado a la conexión de la transacción, así que el servicio usa
 * exactamente la misma API que fuera de ella.
 */
export class OracleUnitOfWork implements IUnitOfWork {
  constructor(
    private readonly db: IOracleConnectionPlugin,
    private readonly repositories: OracleRepositoryRegistry
  ) {}

  execute<R>(work: (scope: ITransactionScope) => Promise<R>): Promise<R> {
    return this.db.transaction(async (tx) => {
      // Memoizado por entidad: dos peticiones del mismo repositorio dentro de la
      // transacción devuelven la misma instancia.
      const bound = new Map<string, unknown>();

      const baseRepositoryOf = (entity: string): OracleGenericRepository<never, never> => {
        const repository = this.repositories.get(entity);
        if (!repository) {
          throw new Error(
            `[OracleUnitOfWork] La entidad "${entity}" no está registrada en la unidad de trabajo. ` +
              `Registradas: ${[...this.repositories.keys()].join(", ")}.`
          );
        }
        return repository;
      };

      const scope: ITransactionScope = {
        repository: <T extends object, TKey = number>(entity: string): IGenericRepository<T, TKey> => {
          const cached = bound.get(entity);
          if (cached) return cached as IGenericRepository<T, TKey>;

          const rebound = baseRepositoryOf(entity).withExecutor(tx);
          bound.set(entity, rebound);
          return rebound as unknown as IGenericRepository<T, TKey>;
        },
      };

      return work(scope);
    });
  }
}
