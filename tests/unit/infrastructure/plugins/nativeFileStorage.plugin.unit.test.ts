// tests/unit/infrastructure/plugins/nativeFileStorage.plugin.unit.test.ts
import fs from "fs";
import path from "path";
import { NativeFileStoragePlugin } from "../../../../src/infrastructure/plugins/nativeFileStorage.plugin";

// Mock explícito de fs
jest.mock("fs", () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  promises: {
    writeFile: jest.fn(),
  },
}));

describe("NativeFileStoragePlugin (fake fs)", () => {
  let plugin: NativeFileStoragePlugin;

  beforeEach(() => {
    jest.clearAllMocks();
    (fs.existsSync as jest.Mock).mockReturnValue(false);
    (fs.mkdirSync as jest.Mock).mockImplementation(() => {});
    (fs.promises.writeFile as jest.Mock).mockResolvedValue(undefined);

    plugin = new NativeFileStoragePlugin("/fake/uploads");
  });

  it("should create fake upload directory if not exists", () => {
    expect(fs.existsSync).toHaveBeenCalledWith("/fake/uploads");
    expect(fs.mkdirSync).toHaveBeenCalledWith("/fake/uploads", { recursive: true });
  });

  it("should save single file into fake directory", async () => {
    const file = { buffer: Buffer.from("hello"), originalname: "test.txt" };

    const result = await plugin.single(file);

    expect(path.normalize(path.dirname(result))).toBe(path.normalize("/fake/uploads"));
    expect(path.basename(result)).toBe("test.txt");
    expect(fs.promises.writeFile).toHaveBeenCalledWith(result, file.buffer);
  });

  it("should save multiple files into fake directory", async () => {
    const files = [
      { buffer: Buffer.from("f1"), originalname: "f1.txt" },
      { buffer: Buffer.from("f2"), originalname: "f2.txt" },
    ];

    const results = await plugin.array(files);

    expect(results).toHaveLength(2);
    results.forEach((r, idx) => {
      expect(path.normalize(path.dirname(r))).toBe(path.normalize("/fake/uploads"));
      expect(path.basename(r)).toBe(`f${idx + 1}.txt`);
    });

    expect(fs.promises.writeFile).toHaveBeenCalledTimes(2);
  });

  it("should use default uploadDirectory if not provided", () => {
    jest.clearAllMocks();

    const plugin = new NativeFileStoragePlugin();
const expectedDir = (plugin as any).uploadDirectory;

expect(fs.existsSync).toHaveBeenCalledWith(expectedDir);
expect(fs.mkdirSync).toHaveBeenCalledWith(expectedDir, { recursive: true });

  });
});
