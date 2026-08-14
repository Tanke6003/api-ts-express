// src/infrastructure/repositories/base/memory.unit-of-work.ts
import type {
  ITransactionScope,
  IUnitOfWork,
} from "../../../../domain/interfaces/infrastructure/repositories/unit-of-work.interface";
import type { IGenericRepository } from "../../../../domain/interfaces/infrastructure/repositories/generic.repository.interface";
import { MemoryGenericRepository, MemorySnapshot } from "../drivers/memory.generic.repository";

export type MemoryRepositoryRegistry = Map<string, MemoryGenericRepository<never, never>>;

/**
 * Equivalente en memoria de `SqlUnitOfWork`.
 *
 * No hay transacciones de verdad, así que la atomicidad se emula fotografiando
 * el estado de los almacenes antes de empezar y restaurándolo si el bloque
 * lanza. Es suficiente para que el modo dummy se comporte igual que un motor
 * real frente a un fallo a mitad de una operación.
 *
 * ## Por qué se ejecutan de una en una
 *
 * Node tiene un solo hilo, pero eso no da aislamiento: entre el `await` de una
 * lectura y el de la escritura que decide, el bucle de eventos atiende otras
 * peticiones. Esa es exactamente la ventana de la que vive una carrera, y aquí
 * además rompería el rollback: dos transacciones solapadas fotografían el mismo
 * estado, y si la segunda falla restauraría una foto anterior a lo que la
 * primera ya había confirmado, borrándolo.
 *
 * Por eso las transacciones se encolan y corren en exclusiva. Es más estricto
 * que un motor real —que sólo serializa a quien compite por la misma fila— pero
 * para un driver de desarrollo es la elección correcta: la garantía que da es la
 * misma o mayor, y el coste no existe porque no hay concurrencia real que
 * aprovechar.
 */
export class MemoryUnitOfWork implements IUnitOfWork {
  /** Cola de transacciones. Nunca rechaza: el fallo se lo queda quien llamó. */
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly repositories: MemoryRepositoryRegistry) {}

  private repositoryOf(entity: string): MemoryGenericRepository<never, never> {
    const repository = this.repositories.get(entity);
    if (!repository) {
      throw new Error(
        `[MemoryUnitOfWork] La entidad "${entity}" no está registrada en la unidad de trabajo. ` +
          `Registradas: ${[...this.repositories.keys()].join(", ")}.`
      );
    }
    return repository;
  }

  execute<R>(work: (scope: ITransactionScope) => Promise<R>): Promise<R> {
    const result = this.queue.then(() => this.runExclusive(work));

    // La cola se queda con una versión que no rechaza; si no, el fallo de una
    // transacción tumbaría a todas las siguientes y saldría además como
    // "unhandled rejection" cuando quien llamó ya lo había atendido.
    this.queue = result.then(
      () => undefined,
      () => undefined
    );

    return result;
  }

  private async runExclusive<R>(work: (scope: ITransactionScope) => Promise<R>): Promise<R> {
    const snapshots = new Map<string, MemorySnapshot<never>>();
    for (const [entity, repository] of this.repositories) {
      snapshots.set(entity, repository.snapshot());
    }

    const scope: ITransactionScope = {
      repository: <T extends object, TKey = number>(entity: string): IGenericRepository<T, TKey> =>
        this.repositoryOf(entity) as unknown as IGenericRepository<T, TKey>,

      /**
       * No hay nada que bloquear: la transacción entera ya corre en exclusiva,
       * que es una garantía más fuerte que la de la fila. Se conserva la
       * comprobación de existencia para que el contrato responda igual que en
       * SQL, borrados lógicos incluidos.
       */
      lockRow: async (entity: string, id: unknown): Promise<boolean> =>
        (await this.repositoryOf(entity).getById(id as never, { withDeleted: true })) !== null,
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
