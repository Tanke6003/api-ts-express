// tests/unit/datasources/users.sqlserver.datasource.test.ts
import "reflect-metadata";
import { UsersSqlServerDataSource } from "../../../src/infrastructure/datasources/sqlserver/users.sqlserver.datasource";
import { ILogger } from "../../../src/domain/interfaces/infrastructure/plugins/logger.plugin.interface";
import { SequelizePlugin } from "../../../src/infrastructure/plugins/sequelize.plugin";
import { IUser } from "../../../src/domain/models/users.model";

describe("UsersSqlServerDataSource Unit Tests", () => {
  let mockLogger: jest.Mocked<ILogger>;
  let mockDb: jest.Mocked<SequelizePlugin>;
  let dataSource: UsersSqlServerDataSource;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      log: jest.fn(),
      http: jest.fn(),
    };

    mockDb = {
      authenticate: jest.fn().mockResolvedValue(undefined),
      executeQuery: jest.fn(),
      getDataTable: jest.fn(),
    } as any;

    dataSource = new UsersSqlServerDataSource(mockLogger, mockDb);
  });

  it("should return all available users with total count", async () => {
    const rows = [
      { PKUser: 1, Name: "Alice" },
      { PKUser: 2, Name: "Bob" },
    ];
    mockDb.executeQuery
      .mockResolvedValueOnce({ rows: [{ total: 2 }], metadata: 0 }) // COUNT
      .mockResolvedValueOnce({ rows, metadata: 2 });                 // Data

    const result = await dataSource.getAllUsers(1, 10);

    expect(result).toEqual({
      users: [
        { pkUser: 1, name: "Alice" },
        { pkUser: 2, name: "Bob" },
      ],
      total: 2,
    });
    expect(mockLogger.debug).toHaveBeenCalledWith("getAllUsers ejecutado", {
      page: 1,
      limit: 10,
      total: 2,
    });
  });

  it("should return a user by id", async () => {
    mockDb.getDataTable.mockResolvedValue([{ PKUser: 1, Name: "Charlie" }]);

    const result = await dataSource.getUserById(1);

    expect(result).toEqual({ pkUser: 1, name: "Charlie" });
    expect(mockDb.getDataTable).toHaveBeenCalledWith(
      "SELECT * FROM Users WHERE PKUser = ? AND Available = 1",
      [1]
    );
  });

  it("should return null if user not found", async () => {
    mockDb.getDataTable.mockResolvedValue([]);

    const result = await dataSource.getUserById(99);

    expect(result).toBeNull();
  });

  it("should create a user", async () => {
    const user: IUser = { pkUser: 0, name: "Dave" };
    mockDb.executeQuery.mockResolvedValue({ rows: [], metadata: 1 });

    const result = await dataSource.createUser(user);

    expect(result).toBe(true);
    expect(mockLogger.info).toHaveBeenCalledWith("Usuario creado", {
      user,
      affected: 1,
    });
  });

  it("should update a user", async () => {
    mockDb.executeQuery.mockResolvedValue({ rows: [], metadata: 1 });

    const result = await dataSource.updateUser(1, { name: "Updated" });

    expect(result).toBe(true);
    expect(mockLogger.info).toHaveBeenCalledWith("Usuario actualizado", {
      id: 1,
      user: { name: "Updated" },
      affected: 1,
    });
  });

  it("should delete a user", async () => {
    mockDb.executeQuery.mockResolvedValue({ rows: [], metadata: 1 });

    const result = await dataSource.deleteUser(1);

    expect(result).toBe(true);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      "Usuario marcado como eliminado",
      { id: 1, affected: 1 }
    );
  });

  it("should return total 0 when count query returns empty rows", async () => {
    mockDb.executeQuery
      .mockResolvedValueOnce({ rows: [], metadata: 0 }) // COUNT returns no row
      .mockResolvedValueOnce({ rows: [], metadata: 0 }); // Data

    const result = await dataSource.getAllUsers(1, 10);

    expect(result).toEqual({ users: [], total: 0 });
  });

  it("should log and throw on DB error in getAllUsers", async () => {
    mockDb.executeQuery.mockRejectedValue(new Error("DB is down"));

    await expect(dataSource.getAllUsers(1, 10)).rejects.toThrow(
      "[DataSource] getAllUsers failed: DB is down"
    );
    expect(mockLogger.error).toHaveBeenCalled();
  });
});
