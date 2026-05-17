// tests/unit/application/validators/users.validators.unit.test.ts
import {
  createUserSchema,
  updateUserSchema,
  paginationSchema,
} from "../../../../src/application/validators/users.validators";

describe("createUserSchema", () => {
  it("should pass with a valid name", () => {
    const result = createUserSchema.safeParse({ name: "Alice" });
    expect(result.success).toBe(true);
  });

  it("should fail when name is empty", () => {
    const result = createUserSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });

  it("should fail when name is missing", () => {
    const result = createUserSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("should fail when name exceeds 100 characters", () => {
    const result = createUserSchema.safeParse({ name: "a".repeat(101) });
    expect(result.success).toBe(false);
  });
});

describe("updateUserSchema", () => {
  it("should pass with a valid name", () => {
    const result = updateUserSchema.safeParse({ name: "Bob" });
    expect(result.success).toBe(true);
  });

  it("should fail when name is empty string", () => {
    const result = updateUserSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });
});

describe("paginationSchema", () => {
  it("should default page to 1 and limit to 10 when omitted", () => {
    const result = paginationSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(1);
      expect(result.data.limit).toBe(10);
    }
  });

  it("should parse page and limit from strings", () => {
    const result = paginationSchema.safeParse({ page: "2", limit: "25" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.page).toBe(2);
      expect(result.data.limit).toBe(25);
    }
  });

  it("should fail when page is 0", () => {
    const result = paginationSchema.safeParse({ page: "0" });
    expect(result.success).toBe(false);
  });

  it("should fail when limit exceeds 100", () => {
    const result = paginationSchema.safeParse({ limit: "101" });
    expect(result.success).toBe(false);
  });
});
