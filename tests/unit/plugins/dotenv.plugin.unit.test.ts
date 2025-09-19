// tests/unit/dotenv.plugin.test.ts
import fs from "fs";
import path from "path";
import { DotenvPlugin } from "../../../src/infrastructure/plugins/dotenv.plugin";

describe("DotenvPlugin", () => {
  const envTestPath = path.resolve(process.cwd(), ".env.test");

  beforeAll(() => {
    // Creamos archivo fake de .env.test para las pruebas
    fs.writeFileSync(envTestPath, "TEST_KEY_TEST=test-value\n");
  });

  afterAll(() => {
    // Borramos archivo fake después de las pruebas
    if (fs.existsSync(envTestPath)) fs.unlinkSync(envTestPath);
  });

  it("carga .env.test si NODE_ENV=test", () => {
    process.env.NODE_ENV = "test";
    const plugin = new DotenvPlugin();
    expect(plugin.getEnv("TEST_KEY_TEST")).toBe("test-value");
  });

  it("lanza error si la variable no existe", () => {
    process.env.NODE_ENV = "test";
    const plugin = new DotenvPlugin();
    expect(() => plugin.getEnv("DOES_NOT_EXIST")).toThrow(
      'La variable de entorno "DOES_NOT_EXIST" no está definida.'
    );
  });
});
