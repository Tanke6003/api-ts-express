// src/infrastructure/repositories/base/unit-of-work/mongo.unit-of-work.ts
import type { ClientSession } from "mongodb";
import type {
  ITransactionScope,
  IUnitOfWork,
} from "../../../../domain/interfaces/infrastructure/repositories/unit-of-work.interface";
import type { IGenericRepository } from "../../../../domain/interfaces/infrastructure/repositories/generic.repository.interface";
import { MongoGenericRepository } from "../drivers/mongo.generic.repository";

/**
 * Lo único que la unidad de trabajo necesita del conector: abrir una sesión y
 * ejecutar el bloque dentro de una transacción. Lo cumple `MongoDbPlugin`.
 */
export interface IMongoTransactionRunner {
  transaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T>;
}

/**
 * Registro heterogéneo de repositorios por nombre lógico de entidad. El tipo
 * concreto se recupera en `repository<T>()`, que es donde el llamador declara
 * qué entidad está pidiendo.
 */
export type MongoRepositoryRegistry = Map<string, MongoGenericRepository<never, never>>;

/**
 * Unidad de trabajo sobre MongoDB: una transacción multi-documento real, con
 * commit al terminar y rollback si algo lanza.
 *
 * Es el gemelo de `SqlUnitOfWork`; lo único que cambia es la forma del ámbito
 * —una sesión en vez de un executor—, porque en MongoDB la transacción no va
 * atada a la conexión sino a la sesión que se le pasa a cada operación.
 */
export class MongoUnitOfWork implements IUnitOfWork {
  constructor(
    private readonly db: IMongoTransactionRunner,
    private readonly repositories: MongoRepositoryRegistry
  ) {}

  execute<R>(work: (scope: ITransactionScope) => Promise<R>): Promise<R> {
    return this.db.transaction(async (session) => {
      // Memoizado por entidad: dos peticiones del mismo repositorio dentro de la
      // transacción devuelven la misma instancia.
      const bound = new Map<string, unknown>();

      const baseRepositoryOf = (entity: string): MongoGenericRepository<never, never> => {
        const repository = this.repositories.get(entity);
        if (!repository) {
          throw new Error(
            `[MongoUnitOfWork] La entidad "${entity}" no está registrada en la unidad de trabajo. ` +
              `Registradas: ${[...this.repositories.keys()].join(", ")}.`
          );
        }
        return repository;
      };

      const scope: ITransactionScope = {
        repository: <T extends object, TKey = number>(entity: string): IGenericRepository<T, TKey> => {
          const cached = bound.get(entity);
          if (cached) return cached as IGenericRepository<T, TKey>;

          const rebound = baseRepositoryOf(entity).withSession(session);
          bound.set(entity, rebound);
          return rebound as unknown as IGenericRepository<T, TKey>;
        },
      };

      return work(scope);
    });
  }
}
