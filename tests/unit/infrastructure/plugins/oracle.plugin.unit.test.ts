import oracledb from "oracledb";
import { OraclePlugin } from "../../../../src/infrastructure/plugins/oracle.plugin";

// El driver real abriría una conexión de verdad; aquí sólo interesa comprobar
// qué le pide el plugin y cómo traduce sus respuestas.
jest.mock("oracledb", () => ({
  createPool: jest.fn(),
  OUT_FORMAT_OBJECT: 4002,
  CLOB: 2006,
  BIND_OUT: 3003,
  NUMBER: 2010,
  CURSOR: 2021,
}));

const CONFIG = {
  user: "appuser",
  password: "secret",
  connectString: "localhost:1521/FREEPDB1",
};

const logger = {
  log: jest.fn(),
  http: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
} as never;

describe("OraclePlugin", () => {
  let connection: any;
  let pool: any;
  let plugin: OraclePlugin;

  beforeEach(() => {
    jest.clearAllMocks();

    connection = {
      execute: jest.fn().mockResolvedValue({ rows: [], rowsAffected: 0, outBinds: {} }),
      executeMany: jest.fn().mockResolvedValue({ rowsAffected: 0 }),
      commit: jest.fn(),
      rollback: jest.fn(),
      close: jest.fn(),
    };
    pool = { getConnection: jest.fn().mockResolvedValue(connection), close: jest.fn() };
    (oracledb.createPool as jest.Mock).mockResolvedValue(pool);

    plugin = new OraclePlugin(CONFIG, logger);
  });

  describe("pool", () => {
    it("se crea de forma perezosa y una sola vez", async () => {
      expect(oracledb.createPool).not.toHaveBeenCalled();

      await Promise.all([plugin.execute("SELECT 1 FROM DUAL"), plugin.execute("SELECT 2 FROM DUAL")]);

      expect(oracledb.createPool).toHaveBeenCalledTimes(1);
      expect(oracledb.createPool).toHaveBeenCalledWith(
        expect.objectContaining({ ...CONFIG, poolMin: 1, poolMax: 10, poolIncrement: 1 })
      );
    });

    it("respeta el dimensionamiento configurado", async () => {
      const tuned = new OraclePlugin({ ...CONFIG, poolMin: 2, poolMax: 4, poolIncrement: 2 }, logger);
      await tuned.execute("SELECT 1 FROM DUAL");

      expect(oracledb.createPool).toHaveBeenCalledWith(
        expect.objectContaining({ poolMin: 2, poolMax: 4, poolIncrement: 2 })
      );
    });

    it("un fallo al crear el pool no queda cacheado: el siguiente intento reintenta", async () => {
      (oracledb.createPool as jest.Mock).mockRejectedValueOnce(new Error("ORA-12541"));

      await expect(plugin.execute("SELECT 1 FROM DUAL")).rejects.toThrow(/createPool failed/);

      // La base ya responde: sin reintento, la promesa rechazada bloquearía la app.
      await expect(plugin.execute("SELECT 1 FROM DUAL")).resolves.toBeDefined();
    });

    it("authenticate hace ping y devuelve la conexión al pool", async () => {
      await plugin.authenticate();

      expect(connection.execute).toHaveBeenCalledWith("SELECT 1 FROM DUAL");
      expect(connection.close).toHaveBeenCalled();
    });

    it("authenticate traduce el fallo del ping", async () => {
      connection.execute.mockRejectedValue(new Error("ORA-01017"));

      await expect(plugin.authenticate()).rejects.toThrow(/authenticate failed/);
      expect(connection.close).toHaveBeenCalled();
    });
  });

  describe("execute", () => {
    it("normaliza la respuesta del driver", async () => {
      connection.execute.mockResolvedValue({
        rows: [{ A: 1 }],
        rowsAffected: 1,
        outBinds: { outpk: [7] },
      });

      const result = await plugin.execute("SELECT :a FROM DUAL", { a: 1 });

      expect(result).toEqual({ rows: [{ A: 1 }], rowsAffected: 1, outBinds: { outpk: [7] } });
      expect(connection.execute).toHaveBeenCalledWith("SELECT :a FROM DUAL", { a: 1 }, { autoCommit: true });
    });

    it("rellena los huecos cuando el driver no devuelve todo", async () => {
      connection.execute.mockResolvedValue({});

      expect(await plugin.execute("SELECT 1 FROM DUAL")).toEqual({
        rows: [],
        rowsAffected: 0,
        outBinds: {},
      });
    });

    it("envuelve el error y devuelve igualmente la conexión", async () => {
      connection.execute.mockRejectedValue(new Error("ORA-00942"));

      await expect(plugin.execute("SELECT 1 FROM DUAL")).rejects.toThrow(/execute failed/);
      expect(connection.close).toHaveBeenCalled();
    });
  });

  describe("executeMany", () => {
    it("devuelve las filas afectadas", async () => {
      connection.executeMany.mockResolvedValue({ rowsAffected: 3 });

      expect(await plugin.executeMany("INSERT ...", [{ a: 1 }, { a: 2 }])).toBe(3);
    });

    it("con lista vacía ni siquiera abre el pool", async () => {
      expect(await plugin.executeMany("INSERT ...", [])).toBe(0);
      expect(oracledb.createPool).not.toHaveBeenCalled();
    });

    it("envuelve el error", async () => {
      connection.executeMany.mockRejectedValue(new Error("ORA-00001"));

      await expect(plugin.executeMany("INSERT ...", [{ a: 1 }])).rejects.toThrow(
        /executeMany failed/
      );
    });
  });

  describe("compatibilidad con ISqlConnectionPlugin", () => {
    it("getDataTable devuelve sólo las filas", async () => {
      connection.execute.mockResolvedValue({ rows: [{ A: 1 }], rowsAffected: 0 });

      expect(await plugin.getDataTable("SELECT 1 FROM DUAL")).toEqual([{ A: 1 }]);
    });

    it("executeQuery expone las filas afectadas como metadata", async () => {
      connection.execute.mockResolvedValue({ rows: [], rowsAffected: 2 });

      expect(await plugin.executeQuery("UPDATE ...")).toEqual({ rows: [], metadata: 2 });
    });
  });

  describe("execStoredProcedure", () => {
    it("llama al bloque anónimo con el cursor de salida y lo cierra", async () => {
      const resultSet = { getRows: jest.fn().mockResolvedValue([{ A: 1 }]), close: jest.fn() };
      connection.execute.mockResolvedValue({ outBinds: { cursor: resultSet } });

      const rows = await plugin.execStoredProcedure("SP_DEMO", [1, "x"]);

      expect(connection.execute).toHaveBeenCalledWith(
        "BEGIN SP_DEMO(:p0, :p1, :cursor); END;",
        expect.objectContaining({
          p0: 1,
          p1: "x",
          cursor: { dir: oracledb.BIND_OUT, type: oracledb.CURSOR },
        })
      );
      expect(rows).toEqual([{ A: 1 }]);
      expect(resultSet.close).toHaveBeenCalled();
    });

    it("devuelve vacío si el procedimiento no expone cursor", async () => {
      connection.execute.mockResolvedValue({ outBinds: {} });

      expect(await plugin.execStoredProcedure("SP_SIN_CURSOR")).toEqual([]);
    });

    it("envuelve el error nombrando el procedimiento", async () => {
      connection.execute.mockRejectedValue(new Error("ORA-06550"));

      await expect(plugin.execStoredProcedure("SP_MALO")).rejects.toThrow(
        /execStoredProcedure SP_MALO failed/
      );
    });
  });

  describe("transaction", () => {
    it("hace commit si el bloque termina bien", async () => {
      const result = await plugin.transaction(async (tx) => {
        await tx.execute("UPDATE ...", { a: 1 });
        return "ok";
      });

      expect(result).toBe("ok");
      // Dentro de la transacción no puede haber auto-commit.
      expect(connection.execute).toHaveBeenCalledWith("UPDATE ...", { a: 1 }, { autoCommit: false });
      expect(connection.commit).toHaveBeenCalled();
      expect(connection.rollback).not.toHaveBeenCalled();
      expect(connection.close).toHaveBeenCalled();
    });

    it("hace rollback y propaga el error original", async () => {
      await expect(
        plugin.transaction(async () => {
          throw new Error("fallo de negocio");
        })
      ).rejects.toThrow("fallo de negocio");

      expect(connection.rollback).toHaveBeenCalled();
      expect(connection.commit).not.toHaveBeenCalled();
      expect(connection.close).toHaveBeenCalled();
    });

    it("executeMany dentro de la transacción tampoco auto-commitea", async () => {
      connection.executeMany.mockResolvedValue({ rowsAffected: 2 });

      const affected = await plugin.transaction((tx) => tx.executeMany("INSERT ...", [{ a: 1 }]));

      expect(affected).toBe(2);
      expect(connection.executeMany).toHaveBeenCalledWith("INSERT ...", [{ a: 1 }], {
        autoCommit: false,
      });
    });

    it("executeMany transaccional con lista vacía no llama al driver", async () => {
      expect(await plugin.transaction((tx) => tx.executeMany("INSERT ...", []))).toBe(0);
      expect(connection.executeMany).not.toHaveBeenCalled();
    });
  });

  describe("bulkInsert", () => {
    it("construye la sentencia a partir de las claves de la primera fila", async () => {
      connection.executeMany.mockResolvedValue({ rowsAffected: 2 });

      await plugin.bulkInsert("ITEMS", [
        { NAME: "a", QTY: 1 },
        { NAME: "b", QTY: 2 },
      ]);

      expect(connection.executeMany).toHaveBeenCalledWith(
        "INSERT INTO ITEMS (NAME, QTY) VALUES (:NAME, :QTY)",
        expect.any(Array),
        { autoCommit: true }
      );
    });

    it("sin registros no hace nada", async () => {
      await plugin.bulkInsert("ITEMS", []);
      expect(oracledb.createPool).not.toHaveBeenCalled();
    });
  });

  describe("close", () => {
    it("drena el pool y deja el plugin inutilizable", async () => {
      await plugin.execute("SELECT 1 FROM DUAL");
      await plugin.close();

      expect(pool.close).toHaveBeenCalledWith(10);
      await expect(plugin.execute("SELECT 1 FROM DUAL")).rejects.toThrow(/ya fue cerrado/);
    });

    it("cerrar sin haber abierto no falla", async () => {
      await expect(plugin.close()).resolves.toBeUndefined();
    });
  });
});
