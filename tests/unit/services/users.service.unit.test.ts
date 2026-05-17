import "reflect-metadata";
import { UsersService } from "../../../src/application/services/users.service";
import { IUsersRepository } from "../../../src/domain/interfaces/infrastructure/repositories/users.repository.interface";
import { IUser } from "../../../src/domain/models/users.model";
import { UserDTO } from "../../../src/application/dtos/users.dtos";

const mockRepository: jest.Mocked<IUsersRepository> = {
  getAllUsers: jest.fn(),
  getUserById: jest.fn(),
  createUser: jest.fn(),
  updateUser: jest.fn(),
  deleteUser: jest.fn(),
};

describe("UsersService Unit Tests", () => {
  let usersService: UsersService;

  beforeEach(() => {
    jest.clearAllMocks();
    usersService = new UsersService(mockRepository);
  });

  it("should receive a repository implementing IUsersRepository", () => {
    expect((usersService as any).repository).toEqual(
      expect.objectContaining({
        getAllUsers: expect.any(Function),
        getUserById: expect.any(Function),
        createUser: expect.any(Function),
        updateUser: expect.any(Function),
        deleteUser: expect.any(Function),
      })
    );
  });

  // ======================================
  // getAllUsers
  // ======================================
  it("should return all users mapped to DTOs with pagination", async () => {
    const mockUsers: IUser[] = [{ pkUser: 1, name: "Test User", available: true }];
    mockRepository.getAllUsers.mockResolvedValue({ users: mockUsers, total: 1 });

    const result = await usersService.getAllUsers({ page: 1, limit: 10 });

    expect(result).toEqual({
      data: [{ id: 1, name: "Test User" }],
      total: 1,
      page: 1,
      limit: 10,
      pages: 1,
    });
    expect(mockRepository.getAllUsers).toHaveBeenCalledWith(1, 10);
  });

  it("should calculate pages correctly", async () => {
    const mockUsers: IUser[] = [{ pkUser: 1, name: "A", available: true }];
    mockRepository.getAllUsers.mockResolvedValue({ users: mockUsers, total: 25 });

    const result = await usersService.getAllUsers({ page: 1, limit: 10 });

    expect(result.pages).toBe(3);
    expect(result.total).toBe(25);
  });

  // ======================================
  // getUserById
  // ======================================
  it("should return a user by ID mapped to DTO", async () => {
    const mockUser: IUser = { pkUser: 1, name: "Test User", available: true };
    mockRepository.getUserById.mockResolvedValue(mockUser);

    const result = await usersService.getUserById(1);

    expect(result).toEqual({ id: 1, name: "Test User" });
    expect(mockRepository.getUserById).toHaveBeenCalledWith(1);
  });

  it("should return null if user not found", async () => {
    mockRepository.getUserById.mockResolvedValue(null);

    const result = await usersService.getUserById(99);

    expect(result).toBeNull();
    expect(mockRepository.getUserById).toHaveBeenCalledWith(99);
  });

  // ======================================
  // createUser
  // ======================================
  it("should create a new user (DTO → Model)", async () => {
    mockRepository.createUser.mockResolvedValue(true);

    const dto: UserDTO = { id: 0, name: "New User" };
    const result = await usersService.createUser(dto);

    expect(result).toBe(true);
    expect(mockRepository.createUser).toHaveBeenCalledWith({ pkUser: 0, name: "New User" });
  });

  it("should throw AppError if createUser returns false", async () => {
    mockRepository.createUser.mockResolvedValue(false);

    await expect(usersService.createUser({ id: 0, name: "Fail" })).rejects.toMatchObject({
      statusCode: 500,
      message: "Failed to create user",
    });
  });

  // ======================================
  // updateUser
  // ======================================
  it("should update a user (DTO → Model)", async () => {
    mockRepository.updateUser.mockResolvedValue(true);

    const dto: UserDTO = { id: 1, name: "Updated User" };
    const result = await usersService.updateUser(1, dto);

    expect(result).toBe(true);
    expect(mockRepository.updateUser).toHaveBeenCalledWith(1, { pkUser: 1, name: "Updated User" });
  });

  // ======================================
  // deleteUser
  // ======================================
  it("should delete a user", async () => {
    mockRepository.deleteUser.mockResolvedValue(true);

    const result = await usersService.deleteUser(1);

    expect(result).toBe(true);
    expect(mockRepository.deleteUser).toHaveBeenCalledWith(1);
  });
});
