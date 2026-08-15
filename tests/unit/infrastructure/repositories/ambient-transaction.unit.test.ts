// tests/unit/repositories/ambient-transaction.unit.test.ts
//
// La transacción ambiental: un repositorio de módulo se apunta solo a la
// transacción abierta, sin que el servicio le pase nada.
//
// Se prueba contra SQL y no contra memoria a propósito. En memoria el
// repositorio del ámbito **es el mismo objeto** que el almacén, así que un test
// allí pasaría igual con el mecanismo y sin él: no demostraría nada. Con SQL la
// diferencia es observable —la sentencia sale por la conexión de la transacción
// o por el pool— y es exactamente lo que hay que comprobar.
import { AsyncTransactionContextPlugin } from "../../../../src/infrastructure/plugins/asyncTransactionContext.plugin";
import { oracleDialect } from "../../../../src/infrastructure/repositories/base/dialects/sql.dialect";
import { SqlGenericRepository } from "../../../../src/infrastructure/repositories/base/drivers/sql.generic.repository";
import { SqlUnitOfWork } from "../../../../src/infrastructure/repositories/base/unit-of-work/sql.unit-of-work";
import { UsersRepository } from "../../../../src/infrastructure/repositories/users.repository";
import { USERS_ENTITY } from "../../../../src/infrastructure/repositories/entities";
import { ENTITY_NAMES } from "../../../../src/domain/models/entity-names";
import type { IUser } from "../../../../src/domain/models/users.model";
import {
  FakeSqlExecutor,
  silentLogger,
} from "./base/fake-sql-executor";

describe("transacción ambiental", () => {
  /** Conexión del pool, con auto-commit. */
  let pool: FakeSqlExecutor;
  /** Conexión atada a la transacción. */
  let tx: FakeSqlExecutor;
  let transactions: AsyncTransactionContextPlugin;
  let unitOfWork: SqlUnitOfWork;
  let repository: UsersRepository;

  /** Respuestas de un insert: la fila afectada y la relectura de la fila. */
  const queueInsert = (executor: FakeSqlExecutor) =>
    executor
      .queue({ outBinds: { insertedId: [1] }, rowsAffected: 1 })
      .queue({ rows: [{ PK_USER: 1, NAME: "Ana" }] });

  beforeEach(() => {
    pool = new FakeSqlExecutor();
    tx = new FakeSqlExecutor();

    const store = new SqlGenericRepository<IUser>(pool, USERS_ENTITY, silentLogger, oracleDialect);
    transactions = new AsyncTransactionContextPlugin();

    unitOfWork = new SqlUnitOfWork(
      { transaction: (work) => work(tx) },
      new Map([[ENTITY_NAMES.USERS, store as never]]),
      transactions
    );

    repository = new UsersRepository(store, silentLogger, transactions);
  });

  it("fuera de una transacción, la sentencia sale por el pool", async () => {
    queueInsert(pool);

    await repository.insert({ name: "Ana" });

    expect(pool.calls.length).toBeGreaterThan(0);
    expect(tx.calls).toHaveLength(0);
  });

  it("dentro de una transacción, el mismo repositorio inyectado sale por ella", async () => {
    queueInsert(tx);

    // Esto es todo lo que escribe el servicio: ni un parámetro extra, ni un
    // `scope.repository(...)`.
    await unitOfWork.execute(async () => {
      await repository.insert({ name: "Ana" });
    });

    expect(tx.calls.length).toBeGreaterThan(0);
    expect(tx.calls[0].sql).toContain("INSERT INTO USERS");
    // Y nada se ha ido por el pool, que es lo que rompería la atomicidad: un
    // insert con auto-commit sobreviviría al rollback de la transacción.
    expect(pool.calls).toHaveLength(0);
  });

  it("al salir de la transacción vuelve a salir por el pool", async () => {
    queueInsert(tx);
    await unitOfWork.execute(async () => repository.insert({ name: "Ana" }));

    expect(transactions.current()).toBeUndefined();

    queueInsert(pool);
    await repository.insert({ name: "Otra" });

    expect(pool.calls.length).toBeGreaterThan(0);
  });

  it("sin contexto, el repositorio nunca se une —el comportamiento de antes", async () => {
    const store = new SqlGenericRepository<IUser>(pool, USERS_ENTITY, silentLogger, oracleDialect);
    const aislado = new UsersRepository(store, silentLogger);
    queueInsert(pool);

    await unitOfWork.execute(async () => {
      await aislado.insert({ name: "Ana" });
    });

    // Sale por el pool aunque haya transacción abierta. No es un fallo: es lo
    // que permite construir un repositorio a mano en un test sin montar nada.
    expect(pool.calls.length).toBeGreaterThan(0);
    expect(tx.calls).toHaveLength(0);
  });
});
