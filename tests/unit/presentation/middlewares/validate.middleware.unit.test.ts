// tests/unit/presentation/middlewares/validate.middleware.unit.test.ts
import { validateBody, validateQuery } from "../../../../src/presentation/middlewares/validate.middleware";
import { z } from "zod";

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

  it("should return 400 with errors when body is invalid", () => {
    mockReq = { body: {} };
    validateBody(schema)(mockReq, mockRes, mockNext);

    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(mockRes.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "error",
        message: "Validation failed",
        errors: expect.any(Array),
      })
    );
  });

  it("should include field path in error response", () => {
    mockReq = { body: {} };
    validateBody(schema)(mockReq, mockRes, mockNext);

    const json = mockRes.json.mock.calls[0][0];
    expect(json.errors[0]).toMatchObject({ field: "name", message: expect.any(String) });
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

  it("should return 400 when query is invalid", () => {
    mockReq = { query: {} };
    validateQuery(schema)(mockReq, mockRes, mockNext);

    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });
});
