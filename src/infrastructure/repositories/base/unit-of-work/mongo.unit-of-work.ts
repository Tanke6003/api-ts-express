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

      const boundRepositoryOf = (entity: string): MongoGenericRepository<never, never> => {
        const cached = bound.get(entity);
        if (cached) return cached as MongoGenericRepository<never, never>;

        const rebound = baseRepositoryOf(entity).withSession(session);
        bound.set(entity, rebound);
        return rebound;
      };

      const scope: ITransactionScope = {
        repository: <T extends object, TKey = number>(entity: string): IGenericRepository<T, TKey> =>
          boundRepositoryOf(entity) as unknown as IGenericRepository<T, TKey>,

        /**
         * MongoDB no tiene una lectura de bloqueo: no hay forma de decir
         * "reserva este documento hasta que confirme". Lo más parecido sería
         * escribirlo para forzar un conflicto de escritura, y eso ensucia el
         * documento con un cambio que no pide el caso de uso.
         *
         * Aquí la garantía la da el índice único parcial de APPOINTMENTS: si dos
         * transacciones intentan el mismo hueco, la segunda falla con un 11000
         * que `error-mapper` ya traduce a 409. Se comprueba que el documento
         * exista para que el contrato devuelva lo mismo que en SQL, incluidos
         * los borrados lógicos: la versión SQL bloquea la fila que hay, sin
         * mirar si está dada de baja.
         */
        lockRow: async (entity: string, id: unknown): Promise<boolean> =>
          (await boundRepositoryOf(entity).getById(id as never, { withDeleted: true })) !== null,
      };

      return work(scope);
    });
  }
}
