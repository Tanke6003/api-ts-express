// tests/unit/repositories/users.repository.unit.test.ts
import { UsersRepository } from "../../../src/infrastructure/repositories/users.repository";
import { IUsersDataSource } from "../../../src/domain/interfaces/infrastructure/datasources/users.datasource.interface";
import { IUser } from "../../../src/domain/models/users.model";
import { ILogger } from "../../../src/domain/interfaces/infrastructure/plugins/logger.plugin.interface";

describe("UsersRepository", () => {
  let mockDataSource: jest.Mocked<IUsersDataSource>;
  let mockLogger: jest.Mocked<ILogger>;
  let repository: UsersRepository;

  const fakeUser: IUser = {
    pkUser: 1,
    name: "John Doe",
  };

  beforeEach(() => {
    // Mock DataSource
    mockDataSource = {
      getAllUsers: jest.fn(),
      getUserById: jest.fn(),
      createUser: jest.fn(),
      updateUser: jest.fn(),
      deleteUser: jest.fn(),
    };

    // Mock Logger
    mockLogger = {
      log: jest.fn(),
      http: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    repository = new UsersRepository(mockDataSource, mockLogger);
  });

  // =========================
  // ✅ Happy Path
  // =========================
  it("should return all users", async () => {
    mockDataSource.getAllUsers.mockResolvedValue([fakeUser]);

    const result = await repository.getAllUsers();

    expect(result).toEqual([fakeUser]);
    expect(mockDataSource.getAllUsers).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it("should return user by ID", async () => {
    mockDataSource.getUserById.mockResolvedValue(fakeUser);

    const result = await repository.getUserById(1);

    expect(result).toEqual(fakeUser);
    expect(mockDataSource.getUserById).toHaveBeenCalledWith(1);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it("should return null when user not found", async () => {
    mockDataSource.getUserById.mockResolvedValue(null);

    const result = await repository.getUserById(999);

    expect(result).toBeNull();
    expect(mockDataSource.getUserById).toHaveBeenCalledWith(999);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it("should create a new user", async () => {
    mockDataSource.createUser.mockResolvedValue(true);

    const result = await repository.createUser(fakeUser);

    expect(result).toBe(true);
    expect(mockDataSource.createUser).toHaveBeenCalledWith(fakeUser);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it("should update a user", async () => {
    mockDataSource.updateUser.mockResolvedValue(true);

    const result = await repository.updateUser(1, { name: "Jane Doe" });

    expect(result).toBe(true);
    expect(mockDataSource.updateUser).toHaveBeenCalledWith(1, { name: "Jane Doe" });
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  it("should delete a user", async () => {
    mockDataSource.deleteUser.mockResolvedValue(true);

    const result = await repository.deleteUser(1);

    expect(result).toBe(true);
    expect(mockDataSource.deleteUser).toHaveBeenCalledWith(1);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  // =========================
  // ❌ Error Path
  // =========================
  it("should log error and throw when getAllUsers fails", async () => {
    mockDataSource.getAllUsers.mockRejectedValue(new Error("DB error"));

    await expect(repository.getAllUsers()).rejects.toThrow("Failed to fetch users.");

    expect(mockLogger.error).toHaveBeenCalledWith(
      "Error in UsersRepository.getAllUsers",
      expect.objectContaining({ error: expect.any(Error) })
    );
  });

  it("should log error and throw when getUserById fails", async () => {
    mockDataSource.getUserById.mockRejectedValue(new Error("DB error"));

    await expect(repository.getUserById(1)).rejects.toThrow("Failed to fetch user.");

    expect(mockLogger.error).toHaveBeenCalledWith(
      "Error in UsersRepository.getUserById",
      expect.objectContaining({ id: 1, error: expect.any(Error) })
    );
  });

  it("should log error and throw when createUser fails", async () => {
    mockDataSource.createUser.mockRejectedValue(new Error("Insert error"));

    await expect(repository.createUser(fakeUser)).rejects.toThrow("Failed to create user.");

    expect(mockLogger.error).toHaveBeenCalledWith(
      "Error in UsersRepository.createUser",
      expect.objectContaining({ user: fakeUser, error: expect.any(Error) })
    );
  });

  it("should log error and throw when updateUser fails", async () => {
    mockDataSource.updateUser.mockRejectedValue(new Error("Update error"));

    await expect(repository.updateUser(1, { name: "Jane Doe" })).rejects.toThrow("Failed to update user.");

    expect(mockLogger.error).toHaveBeenCalledWith(
      "Error in UsersRepository.updateUser",
      expect.objectContaining({ id: 1, user: { name: "Jane Doe" }, error: expect.any(Error) })
    );
  });

  it("should log error and throw when deleteUser fails", async () => {
    mockDataSource.deleteUser.mockRejectedValue(new Error("Delete error"));

    await expect(repository.deleteUser(1)).rejects.toThrow("Failed to delete user.");

    expect(mockLogger.error).toHaveBeenCalledWith(
      "Error in UsersRepository.deleteUser",
      expect.objectContaining({ id: 1, error: expect.any(Error) })
    );
  });
});
