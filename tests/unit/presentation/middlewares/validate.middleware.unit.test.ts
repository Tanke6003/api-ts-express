// tests/unit/presentation/middlewares/validate.middleware.unit.test.ts
import { validateBody, validateQuery } from "../../../../src/presentation/middlewares/validate.middleware";
import { z } from "zod";
import { AppError } from "../../../../src/core/errors/app-error";

const schema = z.object({
  name: z.string().min(1),
});

describe("validateBody", () => {
  let mockReq: any;
  let mockRes: any;
  let mockNext: jest.Mock;

  beforeEach(() => {
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
  });

  it("should call next when body is valid", () => {
    mockReq = { body: { name: "Alice" } };
    validateBody(schema)(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledWith();
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it("should replace req.body with parsed data", () => {
    mockReq = { body: { name: "Alice", extra: "ignored" } };
    validateBody(schema)(mockReq, mockRes, mockNext);

    expect(mockReq.body).toEqual({ name: "Alice" });
  });

  // No responde por su cuenta: delega en el manejador global para que el
  // formato del error sea el mismo en toda la API.
  it("delegates an AppError 400 to the global handler when the body is invalid", () => {
    mockReq = { body: {} };
    validateBody(schema)(mockReq, mockRes, mockNext);

    expect(mockRes.status).not.toHaveBeenCalled();

    const error = mockNext.mock.calls[0][0] as AppError;
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      statusCode: 400,
      code: "VALIDATION_ERROR",
      message: "Validation failed",
    });
  });

  it("should include field path in the error detail", () => {
    mockReq = { body: {} };
    validateBody(schema)(mockReq, mockRes, mockNext);

    const error = mockNext.mock.calls[0][0] as AppError;
    expect(error.errors?.[0]).toMatchObject({ field: "name", message: expect.any(String) });
  });
});

describe("validateQuery", () => {
  let mockReq: any;
  let mockRes: any;
  let mockNext: jest.Mock;

  beforeEach(() => {
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
  });

  it("should set validatedQuery and call next when query is valid", () => {
    mockReq = { query: { name: "Bob" } };
    validateQuery(schema)(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalledWith();
    expect((mockReq as any).validatedQuery).toEqual({ name: "Bob" });
  });

  it("delegates an AppError 400 when the query is invalid", () => {
    mockReq = { query: {} };
    validateQuery(schema)(mockReq, mockRes, mockNext);

    expect(mockRes.status).not.toHaveBeenCalled();
    expect(mockNext.mock.calls[0][0]).toMatchObject({ statusCode: 400, code: "VALIDATION_ERROR" });
  });
});
