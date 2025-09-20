// tests/unit/dotenv.plugin.test.ts
import fs from "fs";
import path from "path";
import { DotenvPlugin } from "../../../../src/infrastructure/plugins/dotenv.plugin";

describe("DotenvPlugin", () => {
  const envTestPath = path.resolve(process.cwd(), ".env.test");

  beforeAll(() => {
    // Create a fake .env.test file for testing
    fs.writeFileSync(envTestPath, "TEST_KEY_TEST=test-value\n");
  });

  afterAll(() => {
    // Remove the fake file after tests
    if (fs.existsSync(envTestPath)) fs.unlinkSync(envTestPath);
  });

  it("loads .env.test when NODE_ENV=test", () => {
    process.env.NODE_ENV = "test";
    const plugin = new DotenvPlugin();
    expect(plugin.getEnv("TEST_KEY_TEST")).toBe("test-value");
  });

it("if the environment variable does not exist, it returns an empty string", () => {
  process.env.NODE_ENV = "test";
  const plugin = new DotenvPlugin();

  // Solo verificamos el valor de retorno
  expect(plugin.getEnv("DOES_NOT_EXIST")).toBe("");
});

});
