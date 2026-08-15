// tests/unit/application/transactional.unit.test.ts
import {
  Transactional,
  TransactionalService,
} from "../../../src/application/transactions/transactional";
import type { IUnitOfWork } from "../../../src/domain/interfaces/infrastructure/repositories/unit-of-work.interface";
import type { ITransactionContext } from "../../../src/domain/interfaces/infrastructure/plugins/transaction-context.plugin.interface";

/**
 * Unidad de trabajo y contexto de mentira, encadenados como los de verdad: el
 * `execute` publica el ámbito mientras corre el bloque.
 */
function harness() {
  const lockRow = jest.fn().mockResolvedValue(true);
  const scope = { repository: jest.fn(), lockRow };

  let active: unknown;
  const transactions = {
    current: () => active,
    run: (_scope: unknown, fn: () => Promise<unknown>) => fn(),
  } as unknown as ITransactionContext;

  const execute = jest.fn(async (work: (s: unknown) => Promise<unknown>) => {
    active = scope;
    try {
      return await work(scope);
    } finally {
      active = undefined;
    }
  });

  return { unitOfWork: { execute } as unknown as IUnitOfWork, transactions, execute, lockRow };
}

class Servicio extends TransactionalService {
  public readonly seen: (boolean | undefined)[] = [];

  constructor(unitOfWork: IUnitOfWork, transactions: ITransactionContext) {
    super(unitOfWork, transactions);
  }

  @Transactional()
  async conTransaccion(): Promise<string> {
    this.seen.push(Boolean(this.transactions.current()));
    return "hecho";
  }

  @Transactional()
  async bloqueando(id: number): Promise<boolean> {
    return this.lockRow("BRANCHES", id);
  }

  @Transactional()
  async llamaAOtroDecorado(): Promise<string> {
    return this.conTransaccion();
  }

  @Transactional()
  async falla(): Promise<never> {
    throw new Error("regla de negocio");
  }

  async sinDecorar(): Promise<boolean> {
    return this.lockRow("BRANCHES", 1);
  }
}

describe("@Transactional", () => {
  it("abre una transacción y el método corre dentro", async () => {
    const { unitOfWork, transactions, execute } = harness();
    const servicio = new Servicio(unitOfWork, transactions);

    await expect(servicio.conTransaccion()).resolves.toBe("hecho");

    expect(execute).toHaveBeenCalledTimes(1);
    expect(servicio.seen).toEqual([true]);
  });

  it("lockRow encuentra la transacción sin recibirla por parámetro", async () => {
    const { unitOfWork, transactions, lockRow } = harness();

    await expect(new Servicio(unitOfWork, transactions).bloqueando(7)).resolves.toBe(true);

    expect(lockRow).toHaveBeenCalledWith("BRANCHES", 7);
  });

  it("un método decorado que llama a otro se une, no anida", async () => {
    const { unitOfWork, transactions, execute } = harness();

    await new Servicio(unitOfWork, transactions).llamaAOtroDecorado();

    // Una sola transacción para los dos: si el interior abriera la suya,
    // confirmaría por su cuenta lo que el exterior aún puede revertir.
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("propaga el error para que la unidad de trabajo revierta", async () => {
    const { unitOfWork, transactions } = harness();

    await expect(new Servicio(unitOfWork, transactions).falla()).rejects.toThrow(
      "regla de negocio"
    );
  });

  it("lockRow fuera de una transacción falla diciendo qué falta", async () => {
    const { unitOfWork, transactions } = harness();

    // El fallo silencioso sería escribir sin bloqueo y creer que hay exclusión.
    await expect(new Servicio(unitOfWork, transactions).sinDecorar()).rejects.toThrow(
      /falta @Transactional/
    );
  });

  it("explica el fallo si la clase no aporta unidad de trabajo", async () => {
    class Suelto {
      @Transactional()
      async algo(): Promise<void> {}
    }

    await expect(new Suelto().algo()).rejects.toThrow(/extiende TransactionalService/i);
  });
});
