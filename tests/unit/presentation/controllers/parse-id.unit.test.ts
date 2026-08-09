import { parseId } from "../../../../src/presentation/controllers/parse-id";

describe("parseId", () => {
  it("acepta enteros positivos", () => {
    expect(parseId("1", "branch")).toBe(1);
    expect(parseId("42", "branch")).toBe(42);
  });

  // `Number("")` es 0 y `Number(" 3 ")` es 3, así que no basta con isNaN.
  it.each([undefined, "", "   ", "abc", "0", "-1", "1.5", "1e3abc"])(
    "rechaza %p con 400",
    (raw) => {
      expect(() => parseId(raw as string | undefined, "branch")).toThrow(/Invalid branch ID/);
    }
  );

  it("nombra el recurso en el mensaje", () => {
    expect(() => parseId("x", "appointment")).toThrow("Invalid appointment ID");
  });
});
