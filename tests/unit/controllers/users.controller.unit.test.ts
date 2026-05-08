// tests/unit/controllers/users.controller.unit.test.ts
import { UsersController } from "../../../src/presentation/controllers/users.controller";
import { IUsersService } from "../../../src/domain/interfaces/application/services/users.service.interface";
import { UserDTO } from "../../../src/application/dtos/users.dtos";

describe("UsersController", () => {
  let mockService: jest.Mocked<IUsersService>;
  let controller: UsersController;
  let mockReq: any;
  let mockRes: any;

  const fakeUser: UserDTO = { id: 1, name: "John Doe" };

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
  });

  // =========================
  // getAllUsers
  // =========================
  describe("getAllUsers", () => {
    it("should return 200 with all users", async () => {
      mockService.getAllUsers.mockResolvedValue([fakeUser]);

      await controller.getAllUsers(mockReq, mockRes);

      expect(mockService.getAllUsers).toHaveBeenCalled();
      expect(mockRes.json).toHaveBeenCalledWith([fakeUser]);
    });

    it("should return 500 if getAllUsers throws", async () => {
      mockService.getAllUsers.mockRejectedValue(new Error("DB error"));

      await controller.getAllUsers(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ message: "Internal server error" });
    });
  });

  // =========================
  // getUserById
  // =========================
  describe("getUserById", () => {
    it("should return user by id", async () => {
      mockReq.params.id = "1";
      mockService.getUserById.mockResolvedValue(fakeUser);

      await controller.getUserById(mockReq, mockRes);

      expect(mockService.getUserById).toHaveBeenCalledWith(1);
      expect(mockRes.json).toHaveBeenCalledWith(fakeUser);
    });

    it("should return 404 if user not found", async () => {
      mockReq.params.id = "99";
      mockService.getUserById.mockResolvedValue(null);

      await controller.getUserById(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ message: "User not found" });
    });

    it("should return 500 if getUserById throws", async () => {
      mockReq.params.id = "1";
      mockService.getUserById.mockRejectedValue(new Error("DB error"));

      await controller.getUserById(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ message: "Internal server error" });
    });
  });

  // =========================
  // createUser
  // =========================
  describe("createUser", () => {
    it("should return 201 on success", async () => {
      mockReq.body = fakeUser;
      mockService.createUser.mockResolvedValue(true);

      await controller.createUser(mockReq, mockRes);

      expect(mockService.createUser).toHaveBeenCalledWith(fakeUser);
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith(true);
    });

    it("should return 500 if createUser throws", async () => {
      mockReq.body = fakeUser;
      mockService.createUser.mockRejectedValue(new Error("Insert error"));

      await controller.createUser(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ message: "Internal server error" });
    });
  });

  // =========================
  // updateUser
  // =========================
  describe("updateUser", () => {
    it("should return updated user", async () => {
      mockReq.params.id = "1";
      mockReq.body = { name: "Jane Doe" };
      mockService.updateUser.mockResolvedValue(true);

      await controller.updateUser(mockReq, mockRes);

      expect(mockService.updateUser).toHaveBeenCalledWith(1, { name: "Jane Doe" });
      expect(mockRes.json).toHaveBeenCalledWith(true);
    });

    it("should return 404 if user not found", async () => {
      mockReq.params.id = "1";
      mockReq.body = { name: "Jane Doe" };
      mockService.updateUser.mockResolvedValue(false);

      await controller.updateUser(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ message: "User not found" });
    });

    it("should return 500 if updateUser throws", async () => {
      mockReq.params.id = "1";
      mockReq.body = { name: "Jane Doe" };
      mockService.updateUser.mockRejectedValue(new Error("Update error"));

      await controller.updateUser(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ message: "Internal server error" });
    });
  });

  // =========================
  // deleteUser
  // =========================
  describe("deleteUser", () => {
    it("should return 204 on success", async () => {
      mockReq.params.id = "1";
      mockService.deleteUser.mockResolvedValue(true);

      await controller.deleteUser(mockReq, mockRes);

      expect(mockService.deleteUser).toHaveBeenCalledWith(1);
      expect(mockRes.status).toHaveBeenCalledWith(204);
      expect(mockRes.send).toHaveBeenCalled();
    });

    it("should return 404 if user not found", async () => {
      mockReq.params.id = "1";
      mockService.deleteUser.mockResolvedValue(false);

      await controller.deleteUser(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({ message: "User not found" });
    });

    it("should return 500 if deleteUser throws", async () => {
      mockReq.params.id = "1";
      mockService.deleteUser.mockRejectedValue(new Error("Delete error"));

      await controller.deleteUser(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ message: "Internal server error" });
    });
  });
});
