// tests/unit/core/app-error.unit.test.ts
import { AppError } from "../../../src/core/errors/app-error";

describe("AppError", () => {
  it("should create an error with the given message and statusCode", () => {
    const err = new AppError("Not found", 404);

    expect(err.message).toBe("Not found");
    expect(err.statusCode).toBe(404);
    expect(err.isOperational).toBe(true);
    expect(err.name).toBe("AppError");
    expect(err).toBeInstanceOf(Error);
  });

  it("should default statusCode to 500 when not provided", () => {
    const err = new AppError("Something failed");

    expect(err.statusCode).toBe(500);
  });

  it("should default isOperational to true", () => {
    const err = new AppError("Oops");
    expect(err.isOperational).toBe(true);
  });

  it("should accept a custom isOperational flag", () => {
    const err = new AppError("Critical failure", 500, false);
    expect(err.isOperational).toBe(false);
  });
});
