// tests/unit/controllers/users.controller.unit.test.ts
import { UsersController } from "../../../src/presentation/controllers/users.controller";
import { IUsersService } from "../../../src/domain/interfaces/application/services/users.service.interface";
import { PaginatedDTO, UserDTO } from "../../../src/application/dtos/users.dtos";
import { AppError } from "../../../src/core/errors/app-error";

describe("UsersController", () => {
  let mockService: jest.Mocked<IUsersService>;
  let controller: UsersController;
  let mockReq: any;
  let mockRes: any;
  let mockNext: jest.Mock;

  const fakeUser: UserDTO = { id: 1, name: "John Doe" };
  const fakePaginated: PaginatedDTO<UserDTO> = {
    data: [fakeUser],
    total: 1,
    page: 1,
    limit: 10,
    pages: 1,
  };

  beforeEach(() => {
    mockService = {
      getUserById: jest.fn(),
      getAllUsers: jest.fn(),
      createUser: jest.fn(),
      updateUser: jest.fn(),
      deleteUser: jest.fn(),
    };

    controller = new UsersController(mockService);

    mockReq = { params: {}, body: {} };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
  });

  // =========================
  // getAllUsers
  // =========================
  describe("getAllUsers", () => {
    it("should return 200 with paginated users", async () => {
      mockService.getAllUsers.mockResolvedValue(fakePaginated);

      await controller.getAllUsers(mockReq, mockRes, mockNext);

      expect(mockService.getAllUsers).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith(fakePaginated);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should call next with error if getAllUsers throws", async () => {
      const err = new Error("DB error");
      mockService.getAllUsers.mockRejectedValue(err);

      await controller.getAllUsers(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(err);
    });
  });

  // =========================
  // getUserById
  // =========================
  describe("getUserById", () => {
    it("should return user by id", async () => {
      mockReq.params.id = "1";
      mockService.getUserById.mockResolvedValue(fakeUser);

      await controller.getUserById(mockReq, mockRes, mockNext);

      expect(mockService.getUserById).toHaveBeenCalledWith(1);
      expect(mockRes.json).toHaveBeenCalledWith(fakeUser);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should call next with 404 AppError if user not found", async () => {
      mockReq.params.id = "99";
      mockService.getUserById.mockResolvedValue(null);

      await controller.getUserById(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404, message: "User not found" })
      );
    });

    it("should call next with 400 AppError for invalid id", async () => {
      mockReq.params.id = "abc";

      await controller.getUserById(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 400 })
      );
    });

    it("should call next with error if getUserById throws", async () => {
      mockReq.params.id = "1";
      const err = new Error("DB error");
      mockService.getUserById.mockRejectedValue(err);

      await controller.getUserById(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(err);
    });
  });

  // =========================
  // createUser
  // =========================
  describe("createUser", () => {
    it("should return 201 on success", async () => {
      mockReq.body = fakeUser;
      mockService.createUser.mockResolvedValue(true);

      await controller.createUser(mockReq, mockRes, mockNext);

      expect(mockService.createUser).toHaveBeenCalledWith(fakeUser);
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({ status: "ok", message: "User created" });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should call next with error if createUser throws", async () => {
      mockReq.body = fakeUser;
      const err = new Error("Insert error");
      mockService.createUser.mockRejectedValue(err);

      await controller.createUser(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(err);
    });
  });

  // =========================
  // updateUser
  // =========================
  describe("updateUser", () => {
    it("should return 200 with success message on update", async () => {
      mockReq.params.id = "1";
      mockReq.body = { name: "Jane Doe" };
      mockService.updateUser.mockResolvedValue(true);

      await controller.updateUser(mockReq, mockRes, mockNext);

      expect(mockService.updateUser).toHaveBeenCalledWith(1, { name: "Jane Doe" });
      expect(mockRes.json).toHaveBeenCalledWith({ status: "ok", message: "User updated" });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should call next with 404 AppError if user not found", async () => {
      mockReq.params.id = "1";
      mockReq.body = { name: "Jane Doe" };
      mockService.updateUser.mockResolvedValue(false);

      await controller.updateUser(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404, message: "User not found" })
      );
    });

    it("should call next with error if updateUser throws", async () => {
      mockReq.params.id = "1";
      mockReq.body = { name: "Jane Doe" };
      const err = new Error("Update error");
      mockService.updateUser.mockRejectedValue(err);

      await controller.updateUser(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(err);
    });
  });

  // =========================
  // deleteUser
  // =========================
  describe("deleteUser", () => {
    it("should return 204 on success", async () => {
      mockReq.params.id = "1";
      mockService.deleteUser.mockResolvedValue(true);

      await controller.deleteUser(mockReq, mockRes, mockNext);

      expect(mockService.deleteUser).toHaveBeenCalledWith(1);
      expect(mockRes.status).toHaveBeenCalledWith(204);
      expect(mockRes.send).toHaveBeenCalled();
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should call next with 404 AppError if user not found", async () => {
      mockReq.params.id = "1";
      mockService.deleteUser.mockResolvedValue(false);

      await controller.deleteUser(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(
        expect.objectContaining({ statusCode: 404, message: "User not found" })
      );
    });

    it("should call next with error if deleteUser throws", async () => {
      mockReq.params.id = "1";
      const err = new Error("Delete error");
      mockService.deleteUser.mockRejectedValue(err);

      await controller.deleteUser(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith(err);
    });
  });
});
