// tests/unit/presentation/middlewares/errorHandler.unit.test.ts
import { errorHandler } from "../../../../src/presentation/middlewares/errorHandler.middleware";
import { AppError } from "../../../../src/core/errors/app-error";

describe("errorHandler middleware", () => {
  let mockReq: any;
  let mockRes: any;
  let mockNext: jest.Mock;

  beforeEach(() => {
    mockReq = {};
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
  });

  it("should return the AppError statusCode and message for operational errors", () => {
    const err = new AppError("User not found", 404);

    errorHandler(err, mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(404);
    expect(mockRes.json).toHaveBeenCalledWith({
      status: "error",
      message: "User not found",
    });
  });

  it("should return 500 and a generic message for unexpected errors", () => {
    const err = new Error("Unexpected crash");

    errorHandler(err, mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({
      status: "error",
      message: "Internal server error",
    });
  });

  it("should handle AppError with default 500 statusCode", () => {
    const err = new AppError("Generic failure");

    errorHandler(err, mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(mockRes.json).toHaveBeenCalledWith({
      status: "error",
      message: "Generic failure",
    });
  });
});
