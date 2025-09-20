
import { QueryTypes, Transaction } from "sequelize";
import { SequelizePlugin  } from "../../../../src/infrastructure/plugins/sequelize.plugin";

describe("SequelizePlugin (unit tests with mocks - MSSQL)", () => {
  let plugin: SequelizePlugin;
  let mockQuery: jest.Mock;

  beforeEach(() => {
    mockQuery = jest.fn();

    plugin = new SequelizePlugin({
      dialect: "mssql",
      host: "localhost",
      port: 1433,
      username: "sa",
      password: "yourStrong(!)Password",
      database: "testdb",
    });

    // Sobreescribimos la conexión real con mocks
    (plugin as any).connection = {
      authenticate: jest.fn().mockResolvedValue(true),
      query: mockQuery,
      close: jest.fn().mockResolvedValue(true),
      transaction: jest.fn().mockImplementation(async (cb: (t: Transaction) => any) => {
        const t = { commit: jest.fn(), rollback: jest.fn() } as unknown as Transaction;
        return cb(t);
      }),
      getDialect: jest.fn().mockReturnValue("mssql"),
    };
  });

  it("should authenticate without errors", async () => {
    await expect(plugin.authenticate()).resolves.not.toThrow();
  });

  it("should run getDataTable and return rows", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 1, name: "test" }]);
    const rows = await plugin.getDataTable("SELECT * FROM users");
    expect(rows).toEqual([{ id: 1, name: "test" }]);
  });

  it("should run executeQuery and return result with metadata", async () => {
    mockQuery.mockResolvedValueOnce([[{ id: 1 }], { rowCount: 1 }]);
    const result = await plugin.executeQuery("UPDATE users SET name=?", ["Ruben"]);
    expect(result.rows).toEqual([{ id: 1 }]);
    expect(result.metadata).toEqual({ rowCount: 1 });
  });

  it("should build correct SQL for execStoredProcedure (mssql)", async () => {
    await plugin.execStoredProcedure("MyProc", [1, "abc"]);
    expect(mockQuery).toHaveBeenCalledWith(
      "EXEC MyProc ?, ?",
      expect.objectContaining({
        replacements: [1, "abc"],
        type: QueryTypes.SELECT,
      })
    );
  });

  it("should throw error for unsupported dialect in execStoredProcedure", async () => {
    (plugin as any).connection.getDialect = jest.fn().mockReturnValue("sqlite");
    await expect(plugin.execStoredProcedure("MyProc")).rejects.toThrow(
      "Dialect sqlite not supported for stored procedures"
    );
  });

  it("should commit transaction if work succeeds", async () => {
    const commit = jest.fn();
    const rollback = jest.fn();
    (plugin as any).connection.transaction = jest.fn().mockResolvedValue({ commit, rollback });

    const result = await plugin.transaction(async () => "ok");

    expect(result).toBe("ok");
    expect(commit).toHaveBeenCalled();
    expect(rollback).not.toHaveBeenCalled();
  });

  it("should rollback transaction if work throws", async () => {
    const commit = jest.fn();
    const rollback = jest.fn();
    (plugin as any).connection.transaction = jest.fn().mockResolvedValue({ commit, rollback });

    await expect(
      plugin.transaction(async () => {
        throw new Error("fail");
      })
    ).rejects.toThrow("fail");

    expect(commit).not.toHaveBeenCalled();
    expect(rollback).toHaveBeenCalled();
  });

  it("should bulkInsert multiple records", async () => {
    await plugin.bulkInsert("users", [{ name: "Ruben" }, { name: "Ana" }]);
    expect(mockQuery).toHaveBeenCalled();
    const [sql, opts] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/INSERT INTO users/);
    expect(opts.replacements).toEqual(["Ruben", "Ana"]);
  });

  it("should not bulkInsert if records are empty", async () => {
    await plugin.bulkInsert("users", []);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("should close the connection", async () => {
    const mockClose = jest.fn();
    (plugin as any).connection.close = mockClose;
    await plugin.close();
    expect(mockClose).toHaveBeenCalled();
  });
});
