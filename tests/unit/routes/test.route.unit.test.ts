import request from "supertest";
import express from "express";
import { container } from "tsyringe";
import { IEnvs } from "../../../src/domain/interfaces/infrastructure/plugins/envs.plugin.interface";
import { S3FileStoragePlugin } from "../../../src/infrastructure/plugins/s3FileStorage.plugin";
import { TestRoutes } from "../../../src/presentation/routes/test.route";

// mock del S3FileStoragePlugin
jest.mock("../../../src/infrastructure/plugins/s3FileStorage.plugin");

describe("TestRoutes (unit)", () => {
  let app: express.Express;

  beforeEach(() => {
    // Reiniciar el contenedor de tsyringe
    container.reset();

    // Mock de IEnvs para devolver siempre un JWT_SECRET
    container.register<IEnvs>("IEnvs", {
      useValue: {
        getEnv: (key: string) => {
          if (key === "JWT_SECRET") return "unit-test-secret";
          return "";
        },
      },
    });

    // Mock de S3FileStoragePlugin
    (S3FileStoragePlugin as jest.Mock).mockImplementation(() => ({
      single: jest.fn().mockResolvedValue("https://fake-bucket.s3.amazonaws.com/file.txt"),
      array: jest.fn().mockResolvedValue([
        "https://fake-bucket.s3.amazonaws.com/file1.txt",
        "https://fake-bucket.s3.amazonaws.com/file2.txt",
      ]),
    }));

    // Inicializar Express y registrar las rutas de prueba
    app = express();
    app.use(express.json());
    new TestRoutes().register(app);
  });

  // =============================
  // ✅ Ruta GET /api/generate-token
  // =============================
  it("GET /api/generate-token should return a token", async () => {
    const res = await request(app).get("/api/generate-token");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("token");
    expect(typeof res.body.token).toBe("string");
  });

  // =============================
  // ✅ Ruta POST /api/upload-file
  // =============================
  it("POST /api/upload-file should return mocked path", async () => {
    const res = await request(app)
      .post("/api/upload-file")
      .attach("file", Buffer.from("hello"), "file.txt");

    expect(res.status).toBe(200);
    expect(res.body.path).toBe("https://fake-bucket.s3.amazonaws.com/file.txt");
  });

  // =============================
  // ✅ Ruta POST /api/upload-files
  // =============================
  it("POST /api/upload-files should return mocked paths", async () => {
    const res = await request(app)
      .post("/api/upload-files")
      .attach("files", Buffer.from("one"), "file1.txt")
      .attach("files", Buffer.from("two"), "file2.txt");

    expect(res.status).toBe(200);
    expect(res.body.paths).toEqual([
      "https://fake-bucket.s3.amazonaws.com/file1.txt",
      "https://fake-bucket.s3.amazonaws.com/file2.txt",
    ]);
  });
});
