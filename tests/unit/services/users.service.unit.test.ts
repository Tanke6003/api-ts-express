import "reflect-metadata";
import { UsersService } from "../../../src/application/services/users.service";
import { IUsersRepository } from "../../../src/domain/interfaces/infrastructure/repositories/users.repository.interface";
import { IUser } from "../../../src/domain/models/users.model";
import { UserDTO } from "../../../src/application/dtos/users.dtos";

const mockRepository = {
  getPaged: jest.fn(),
  getById: jest.fn(),
  insert: jest.fn(),
  update: jest.fn(),
  softDelete: jest.fn(),
} as unknown as jest.Mocked<IUsersRepository>;

describe("UsersService Unit Tests", () => {
  let usersService: UsersService;

  beforeEach(() => {
    jest.clearAllMocks();
    usersService = new UsersService(mockRepository);
  });

  it("should receive a repository implementing IUsersRepository", () => {
    expect((usersService as any).repository).toEqual(
      expect.objectContaining({
        getPaged: expect.any(Function),
        getById: expect.any(Function),
        insert: expect.any(Function),
        update: expect.any(Function),
        softDelete: expect.any(Function),
      })
    );
  });

  // ======================================
  // getAllUsers
  // ======================================
  it("should return all users mapped to DTOs with pagination", async () => {
    const mockUsers: IUser[] = [{ pkUser: 1, name: "Test User", available: true }];
    mockRepository.getPaged.mockResolvedValue({ items: mockUsers, total: 1, page: 1, limit: 10, pages: 1 });

    const result = await usersService.getAllUsers({ page: 1, limit: 10 });

    expect(result).toEqual({
      data: [{ id: 1, name: "Test User", email: null, phone: null, wallet: null, isClient: true }],
      total: 1,
      page: 1,
      limit: 10,
      pages: 1,
    });
    expect(mockRepository.getPaged).toHaveBeenCalledWith(1, 10, {
      orderBy: { field: "pkUser", direction: "asc" },
    });
  });

  it("should calculate pages correctly", async () => {
    const mockUsers: IUser[] = [{ pkUser: 1, name: "A", available: true }];
    mockRepository.getPaged.mockResolvedValue({ items: mockUsers, total: 25, page: 1, limit: 10, pages: 3 });

    const result = await usersService.getAllUsers({ page: 1, limit: 10 });

    expect(result.pages).toBe(3);
    expect(result.total).toBe(25);
  });

  // ======================================
  // getUserById
  // ======================================
  it("should return a user by ID mapped to DTO", async () => {
    const mockUser: IUser = { pkUser: 1, name: "Test User", available: true };
    mockRepository.getById.mockResolvedValue(mockUser);

    const result = await usersService.getUserById(1);

    expect(result).toEqual({
      id: 1,
      name: "Test User",
      email: null,
      phone: null,
      wallet: null,
      isClient: true,
    });
    expect(mockRepository.getById).toHaveBeenCalledWith(1);
  });

  it("should return null if user not found", async () => {
    mockRepository.getById.mockResolvedValue(null);

    const result = await usersService.getUserById(99);

    expect(result).toBeNull();
    expect(mockRepository.getById).toHaveBeenCalledWith(99);
  });

  // ======================================
  // createUser
  // ======================================
  it("should create a new user (DTO → Model)", async () => {
    mockRepository.insert.mockResolvedValue({ pkUser: 1, name: "New User" } as never);

    const dto: UserDTO = { id: 0, name: "New User" };
    const result = await usersService.createUser(dto);

    expect(result).toBe(true);
    expect(mockRepository.insert).toHaveBeenCalledWith({
      name: "New User",
      email: null,
      phone: null,
      wallet: null,
      isClient: true,
    });
  });

  it("should throw AppError if createUser returns false", async () => {
    mockRepository.insert.mockResolvedValue(null as never);

    await expect(usersService.createUser({ id: 0, name: "Fail" })).rejects.toMatchObject({
      statusCode: 500,
      message: "Failed to create user",
    });
  });

  // ======================================
  // updateUser
  // ======================================
  it("should update a user mapping only the present fields (no pkUser in the change set)", async () => {
    mockRepository.update.mockResolvedValue({ pkUser: 1 } as never);

    const dto: UserDTO = { id: 1, name: "Updated User" };
    const result = await usersService.updateUser(1, dto);

    expect(result).toBe(true);
    expect(mockRepository.update).toHaveBeenCalledWith(1, { name: "Updated User" });
  });

  it("should not invent a pkUser 0 nor a name when updating with an empty payload", async () => {
    mockRepository.update.mockResolvedValue({ pkUser: 1 } as never);

    const result = await usersService.updateUser(5, {});

    expect(result).toBe(true);
    expect(mockRepository.update).toHaveBeenCalledWith(5, {});
    const [, partial] = mockRepository.update.mock.calls[0];
    expect(partial).not.toHaveProperty("pkUser");
    expect(partial).not.toHaveProperty("name");
  });

  it("should map only the name on a partial update", async () => {
    mockRepository.update.mockResolvedValue({ pkUser: 1 } as never);

    await usersService.updateUser(7, { name: "Only Name" });

    expect(mockRepository.update).toHaveBeenCalledWith(7, { name: "Only Name" });
  });

  // ======================================
  // deleteUser
  // ======================================
  it("should delete a user", async () => {
    mockRepository.softDelete.mockResolvedValue(true);

    const result = await usersService.deleteUser(1);

    expect(result).toBe(true);
    expect(mockRepository.softDelete).toHaveBeenCalledWith(1);
  });
});
