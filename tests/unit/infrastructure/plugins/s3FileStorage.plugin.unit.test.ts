// tests/unit/infrastructure/plugins/s3FileStorage.plugin.unit.test.ts
import { S3FileStoragePlugin } from "../../../../src/infrastructure/plugins/s3FileStorage.plugin";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

// 🔥 Mock del SDK
jest.mock("@aws-sdk/client-s3");

describe("S3FileStoragePlugin", () => {
  let plugin: S3FileStoragePlugin;
  let mockSend: jest.Mock;
  let putObjectSpy: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // mock del client con send
    mockSend = jest.fn().mockResolvedValue({});
    (S3Client as unknown as jest.Mock).mockImplementation(() => ({
      send: mockSend,
    }));

    // mock del constructor de PutObjectCommand para capturar args
    putObjectSpy = jest.fn();
    (PutObjectCommand as unknown as jest.Mock).mockImplementation((args) => {
      putObjectSpy(args);
      return { args }; // se devuelve objeto con los args simulados
    });

    plugin = new S3FileStoragePlugin(
      "my-bucket",
      "us-east-1",
      "fakeAccessKey",
      "fakeSecret",
      "http://localhost:9000"
    );
  });

  // ======================
  // ✅ single()
  // ======================
  it("should upload a single file and return URL", async () => {
    const file = { buffer: Buffer.from("hello"), originalname: "test.txt" };

    const result = await plugin.single(file);

    // validamos que se llamó PutObjectCommand con los parámetros correctos
    expect(putObjectSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        Bucket: "my-bucket",
        Key: "test.txt",
        Body: file.buffer,
        ACL: "public-read",
      })
    );

    // y que se devolvió la URL pública esperada
    expect(result).toBe("https://my-bucket.s3.amazonaws.com/test.txt");
  });

  // ======================
  // ✅ array()
  // ======================
  it("should upload multiple files and return URLs", async () => {
    const files = [
      { buffer: Buffer.from("f1"), originalname: "f1.txt" },
      { buffer: Buffer.from("f2"), originalname: "f2.txt" },
    ];

    const results = await plugin.array(files);

    expect(results).toEqual([
      "https://my-bucket.s3.amazonaws.com/f1.txt",
      "https://my-bucket.s3.amazonaws.com/f2.txt",
    ]);

    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(putObjectSpy).toHaveBeenCalledTimes(2);
  });

  // ======================
  // ❌ error case
  // ======================
  it("should throw if upload fails", async () => {
    mockSend.mockRejectedValueOnce(new Error("Upload failed"));

    const file = { buffer: Buffer.from("fail"), originalname: "fail.txt" };

    await expect(plugin.single(file)).rejects.toThrow("Upload failed");
  });
});
