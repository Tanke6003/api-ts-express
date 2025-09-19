import "reflect-metadata";
import { UsersService } from "../../../src/application/services/users.service";
import { IUsersRepository } from "../../../src/domain/interfaces/infrastructure/repositories/users.repository.interface";
import { IUser } from "../../../src/domain/models/users.model";
import { UserDTO } from "../../../src/application/dtos/users.dtos";

// Mock del repositorio
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

  it("should return all users mapped to DTOs", async () => {
    const mockUsers: IUser[] = [{ pkUser: 1, name: "Test User" }];
    mockRepository.getAllUsers.mockResolvedValue(mockUsers);

    const result = await usersService.getAllUsers();

    expect(result).toEqual([{ id: 1, name: "Test User" }]); // DTO
    expect(mockRepository.getAllUsers).toHaveBeenCalledTimes(1);
  });

  it("should return a user by ID mapped to DTO", async () => {
    const mockUser: IUser = { pkUser: 1, name: "Test User" };
    mockRepository.getUserById.mockResolvedValue(mockUser);

    const result = await usersService.getUserById(1);

    expect(result).toEqual({ id: 1, name: "Test User" }); // DTO
    expect(mockRepository.getUserById).toHaveBeenCalledWith(1);
  });

  it("should return null if user not found", async () => {
    mockRepository.getUserById.mockResolvedValue(null);

    const result = await usersService.getUserById(99);

    expect(result).toBeNull();
  });

  it("should create a new user (DTO → Model)", async () => {
    mockRepository.createUser.mockResolvedValue(true);

    const dto: UserDTO = { id: 0, name: "New User" };
    const result = await usersService.createUser(dto);

    expect(result).toBe(true);
    expect(mockRepository.createUser).toHaveBeenCalledWith({ pkUser: 0, name: "New User" });
  });

  it("should update a user (DTO → Model)", async () => {
    mockRepository.updateUser.mockResolvedValue(true);

    const dto: UserDTO = { id: 1, name: "Updated User" };
    const result = await usersService.updateUser(1, dto);

    expect(result).toBe(true);
    expect(mockRepository.updateUser).toHaveBeenCalledWith(1, { pkUser: 1, name: "Updated User" });
  });

  it("should delete a user", async () => {
    mockRepository.deleteUser.mockResolvedValue(true);

    const result = await usersService.deleteUser(1);

    expect(result).toBe(true);
    expect(mockRepository.deleteUser).toHaveBeenCalledWith(1);
  });
});
