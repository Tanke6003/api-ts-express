// tests/unit/infrastructure/plugins/sequelize-db.plugin.unit.test.ts
//
// El conector de SQL Server, PostgreSQL y MySQL: tres de los seis motores
// dependen de él y estaba por debajo del 10 % de cobertura.
//
// Sequelize va doblado, así que no hace falta base. Lo que se comprueba es
// justo lo que este conector decide y no se ve desde arriba: cómo le pide a
// cada motor las filas afectadas y el id generado, que es donde difieren.
import type { ILogger } from "../../../../src/domain/interfaces/infrastructure/plugins/logger.plugin.interface";

/** Instancia de Sequelize que devuelve el constructor doblado. */
const sequelize = {
  query: jest.fn(),
  authenticate: jest.fn(),
  close: jest.fn(),
  transaction: jest.fn(),
};

jest.mock("sequelize", () => ({
  Sequelize: jest.fn(() => sequelize),
  QueryTypes: { SELECT: "SELECT", INSERT: "INSERT", BULKUPDATE: "BULKUPDATE" },
}));

import { Sequelize } from "sequelize";
import {
  SequelizeDbPlugin,
  type SequelizeEngine,
} from "../../../../src/infrastructure/plugins/sequelize-db.plugin";

const logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  trace: jest.fn(),
} as unknown as ILogger;

const build = (engine: SequelizeEngine) =>
  new SequelizeDbPlugin(
    {
      engine,
      host: "localhost",
      port: 1234,
      username: "user",
      password: "secret",
      database: "testdb",
    },
    logger
  );

/** Último juego de opciones con el que se llamó a `query`. */
const lastOptions = () => sequelize.query.mock.calls.at(-1)?.[1] as Record<string, unknown>;
const lastSql = () => sequelize.query.mock.calls.at(-1)?.[0] as string;

describe("SequelizeDbPlugin", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("conexión", () => {
    it("expone el motor configurado", () => {
      expect(build("postgres").engine).toBe("postgres");
      expect(build("mssql").engine).toBe("mssql");
    });

    it("authenticate confirma que la base responde", async () => {
      sequelize.authenticate.mockResolvedValue(undefined);

      await expect(build("mysql").authenticate()).resolves.toBeUndefined();
      expect(sequelize.authenticate).toHaveBeenCalled();
    });

    it("un fallo de conexión se envuelve conservando la causa", async () => {
      const original = new Error("ECONNREFUSED");
      sequelize.authenticate.mockRejectedValue(original);

      // La causa tiene que sobrevivir: `error-mapper` la recorre para
      // distinguir "la base no está" de "el cliente mandó algo mal".
      await expect(build("postgres").authenticate()).rejects.toMatchObject({
        message: expect.stringContaining("authenticate failed"),
        cause: original,
      });
    });

    it("close libera el pool", async () => {
      sequelize.close.mockResolvedValue(undefined);

      await build("mysql").close();
      expect(sequelize.close).toHaveBeenCalled();
    });
  });

  describe("lectura", () => {
    it("pide un conjunto de resultados y devuelve las filas", async () => {
      sequelize.query.mockResolvedValue([{ ID: 1 }, { ID: 2 }]);

      const result = await build("postgres").execute("SELECT * FROM T", { a: 1 });

      expect(lastOptions()).toMatchObject({ type: "SELECT", replacements: { a: 1 } });
      expect(result.rows).toHaveLength(2);
      // Sin filas afectadas propias, el conteo es el de lo leído.
      expect(result.rowsAffected).toBe(2);
    });

    it("`rows` es el modo por defecto", async () => {
      sequelize.query.mockResolvedValue([]);

      await build("mysql").execute("SELECT 1");

      expect(lastOptions()).toMatchObject({ type: "SELECT" });
    });
  });

  describe("filas afectadas", () => {
    it("SQL Server las pide con @@ROWCOUNT, porque no las reporta", async () => {
      sequelize.query.mockResolvedValue([{ OTRA: 1 }, { AFFECTEDROWS: 3 }]);

      const result = await build("mssql").execute("UPDATE T SET A = 1", {}, {
        expects: "affected",
      });

      expect(lastSql()).toBe("UPDATE T SET A = 1; SELECT @@ROWCOUNT AS AFFECTEDROWS;");
      // Se lee la última fila del lote: @@ROWCOUNT refleja la última sentencia.
      expect(result.rowsAffected).toBe(3);
    });

    it("SQL Server sin respuesta cuenta cero en vez de un NaN", async () => {
      sequelize.query.mockResolvedValue([]);

      const result = await build("mssql").execute("UPDATE T SET A = 1", {}, {
        expects: "affected",
      });

      expect(result.rowsAffected).toBe(0);
    });

    it("PostgreSQL y MySQL las devuelven solos", async () => {
      sequelize.query.mockResolvedValue(7);

      const result = await build("postgres").execute("DELETE FROM T", {}, {
        expects: "affected",
      });

      expect(lastOptions()).toMatchObject({ type: "BULKUPDATE" });
      expect(lastSql()).toBe("DELETE FROM T");
      expect(result.rowsAffected).toBe(7);
    });
  });

  describe("id generado", () => {
    it("lo recoge del driver y lo publica donde lo busca el dialecto", async () => {
      sequelize.query.mockResolvedValue([42, 1]);

      const result = await build("mysql").execute("INSERT INTO T ...", {}, {
        expects: "identity",
      });

      expect(lastOptions()).toMatchObject({ type: "INSERT" });
      expect(result.rows).toEqual([{ insertedId: 42 }]);
      expect(result.rowsAffected).toBe(1);
    });
  });

  describe("errores de sentencia", () => {
    it("se registran con el SQL y se propagan con la causa", async () => {
      const original = new Error("ORA-nada, esto es Postgres");
      sequelize.query.mockRejectedValue(original);

      await expect(build("postgres").execute("SELECT boom")).rejects.toMatchObject({
        message: expect.stringContaining("execute failed"),
        cause: original,
      });

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining("postgres"),
        expect.objectContaining({ sql: "SELECT boom" })
      );
    });
  });

  describe("executeMany", () => {
    it("un lote vacío no toca la base", async () => {
      await expect(build("mysql").executeMany("INSERT INTO T ...", [])).resolves.toBe(0);

      expect(sequelize.transaction).not.toHaveBeenCalled();
      expect(sequelize.query).not.toHaveBeenCalled();
    });

    it("repite la sentencia dentro de una transacción y suma lo afectado", async () => {
      // Sequelize no tiene un bulk como el de node-oracledb: la garantía de
      // "entran todas o ninguna" la da la transacción.
      const tx = { id: "tx" };
      sequelize.transaction.mockImplementation((work: (t: unknown) => Promise<unknown>) =>
        work(tx)
      );
      sequelize.query.mockResolvedValue(1);

      const affected = await build("postgres").executeMany("INSERT INTO T ...", [
        { a: 1 },
        { a: 2 },
      ]);

      expect(affected).toBe(2);
      expect(sequelize.query).toHaveBeenCalledTimes(2);
      // Cada fila viaja con sus binds, y todas por la misma transacción.
      expect(sequelize.query.mock.calls[0][1]).toMatchObject({ replacements: { a: 1 }, transaction: tx });
      expect(sequelize.query.mock.calls[1][1]).toMatchObject({ replacements: { a: 2 }, transaction: tx });
    });
  });

  describe("transaction", () => {
    it("entrega un executor atado a la transacción", async () => {
      const tx = { id: "tx" };
      sequelize.transaction.mockImplementation((work: (t: unknown) => Promise<unknown>) =>
        work(tx)
      );
      sequelize.query.mockResolvedValue([]);

      const result = await build("mysql").transaction(async (executor) => {
        await executor.execute("SELECT 1");
        return "hecho";
      });

      expect(result).toBe("hecho");
      // Sin la transacción en las opciones, la sentencia iría por el pool con
      // auto-commit y sobreviviría al rollback.
      expect(lastOptions()).toMatchObject({ transaction: tx });
    });

    it("el executeMany del executor también entra en la misma transacción", async () => {
      const tx = { id: "tx" };
      sequelize.transaction.mockImplementation((work: (t: unknown) => Promise<unknown>) =>
        work(tx)
      );
      sequelize.query.mockResolvedValue(1);

      const affected = await build("postgres").transaction((executor) =>
        executor.executeMany("INSERT INTO T ...", [{ a: 1 }])
      );

      expect(affected).toBe(1);
      // Una sola transacción: la del bloque, no otra por el lote.
      expect(sequelize.transaction).toHaveBeenCalledTimes(1);
      expect(lastOptions()).toMatchObject({ transaction: tx });
    });

    it("un lote vacío dentro de la transacción tampoco consulta", async () => {
      const tx = { id: "tx" };
      sequelize.transaction.mockImplementation((work: (t: unknown) => Promise<unknown>) =>
        work(tx)
      );

      const affected = await build("mysql").transaction((executor) =>
        executor.executeMany("INSERT INTO T ...", [])
      );

      expect(affected).toBe(0);
      expect(sequelize.query).not.toHaveBeenCalled();
    });
  });

  it("registra el SQL en desarrollo para poder verlo", () => {
    build("postgres");

    const options = (Sequelize as unknown as jest.Mock).mock.calls.at(-1)?.[0] as {
      logging: unknown;
    };

    // En producción se apaga: el SQL en el log es ruido y puede llevar datos.
    expect(typeof options.logging).toBe(process.env.NODE_ENV === "production" ? "boolean" : "function");
  });
});
