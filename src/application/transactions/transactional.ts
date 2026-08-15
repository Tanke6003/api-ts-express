// src/application/transactions/transactional.ts
//
// `@Transactional()` y la base que lo sostiene.
//
// El decorador sustituye al `unitOfWork.execute(...)` que envolvía el cuerpo del
// método. Lo que hace posible que valga la pena es la transacción ambiental: sin
// ella el bloque recibía el ámbito por parámetro y no había forma de quitarlo de
// la firma.
import type { IUnitOfWork } from "../../domain/interfaces/infrastructure/repositories/unit-of-work.interface";
import type { ITransactionContext } from "../../domain/interfaces/infrastructure/plugins/transaction-context.plugin.interface";

/**
 * Lo que el decorador necesita encontrar en el servicio. Se cumple extendiendo
 * `TransactionalService`.
 */
interface TransactionalHost {
  readonly unitOfWork: IUnitOfWork;
  readonly transactions: ITransactionContext;
}

/**
 * Base de los servicios que abren transacciones.
 *
 * Aporta las dos dependencias que el decorador busca y, sobre todo, `lockRow`:
 * sin él el bloqueo se quedaría sin el ámbito del que sale, que era la objeción
 * de fondo contra el decorador.
 */
export abstract class TransactionalService {
  protected constructor(
    readonly unitOfWork: IUnitOfWork,
    readonly transactions: ITransactionContext
  ) {}

  /**
   * Bloquea una fila hasta el commit. Sólo tiene sentido dentro de una
   * transacción, así que fuera de una falla en el acto y diciendo qué falta.
   *
   * **Debe ser la primera sentencia del método.** MySQL fija la instantánea en
   * la primera lectura consistente; si antes hubo un SELECT normal, lo que se
   * lea después seguirá viendo el estado viejo aunque el bloqueo se conceda.
   */
  protected async lockRow(entity: string, id: unknown): Promise<boolean> {
    const scope = this.transactions.current();

    if (!scope) {
      throw new Error(
        `[Transactional] lockRow("${entity}") se llamó fuera de una transacción. ` +
          "Al método le falta @Transactional(), o alguien se lo quitó."
      );
    }

    return scope.lockRow(entity, id);
  }
}

/**
 * Ejecuta el método dentro de una transacción.
 *
 * Si ya hay una abierta **se une a ella** en vez de anidar otra: dos servicios
 * transaccionales que se llamen entre sí comparten commit, que es lo que se
 * espera y lo que evita que el interior confirme por su cuenta lo que el
 * exterior aún puede revertir.
 *
 * No sirve para un método que necesite leer *antes* de abrir la transacción:
 * ahí el `unitOfWork.execute(...)` explícito sigue siendo la forma correcta.
 * `AppointmentsService.update` es justo ese caso y lo explica en su sitio.
 */
export function Transactional() {
  return function (
    _target: object,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ): PropertyDescriptor {
    const original = descriptor.value as (...args: unknown[]) => Promise<unknown>;

    descriptor.value = function (this: TransactionalHost, ...args: unknown[]): Promise<unknown> {
      if (typeof this?.unitOfWork?.execute !== "function") {
        // Rechaza en vez de lanzar: el método decorado se espera con `await`, y
        // un error síncrono desde algo que parece asíncrono se escapa de los
        // try/catch de quien llama.
        return Promise.reject(
          new Error(
            `[Transactional] ${propertyKey} está decorado pero su clase no expone una ` +
              "unidad de trabajo. Extiende TransactionalService."
          )
        );
      }

      // Ya dentro de una transacción: se une, no abre otra.
      if (this.transactions?.current()) return original.apply(this, args);

      return this.unitOfWork.execute(() => original.apply(this, args));
    };

    return descriptor;
  };
}
