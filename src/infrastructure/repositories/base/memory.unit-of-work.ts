// src/infrastructure/repositories/base/memory.unit-of-work.ts
import type {
  ITransactionScope,
  IUnitOfWork,
} from "../../../domain/interfaces/infrastructure/repositories/unit-of-work.interface";
import type { IGenericRepository } from "../../../domain/interfaces/infrastructure/repositories/generic.repository.interface";
import { MemoryGenericRepository, MemorySnapshot } from "./memory.generic.repository";

export type MemoryRepositoryRegistry = Map<string, MemoryGenericRepository<never, never>>;

/**
 * Equivalente en memoria de `OracleUnitOfWork`.
 *
 * No hay transacciones de verdad, así que la atomicidad se emula fotografiando
 * el estado de los almacenes antes de empezar y restaurándolo si el bloque
 * lanza. Es suficiente para que el modo dummy se comporte igual que Oracle
 * frente a un fallo a mitad de una operación.
 *
 * Limitación asumida: al ser un proceso de desarrollo de un solo hilo lógico, no
 * hay aislamiento entre operaciones concurrentes como sí lo hay en la base.
 */
export class MemoryUnitOfWork implements IUnitOfWork {
  constructor(private readonly repositories: MemoryRepositoryRegistry) {}

  async execute<R>(work: (scope: ITransactionScope) => Promise<R>): Promise<R> {
    const snapshots = new Map<string, MemorySnapshot<never>>();
    for (const [entity, repository] of this.repositories) {
      snapshots.set(entity, repository.snapshot());
    }

    const scope: ITransactionScope = {
      repository: <T extends object, TKey = number>(entity: string): IGenericRepository<T, TKey> => {
        const repository = this.repositories.get(entity);
        if (!repository) {
          throw new Error(
            `[MemoryUnitOfWork] La entidad "${entity}" no está registrada en la unidad de trabajo. ` +
              `Registradas: ${[...this.repositories.keys()].join(", ")}.`
          );
        }
        return repository as unknown as IGenericRepository<T, TKey>;
      },
    };

    try {
      return await work(scope);
    } catch (error) {
      for (const [entity, snapshot] of snapshots) {
        this.repositories.get(entity)?.restoreSnapshot(snapshot);
      }
      throw error;
    }
  }
}
