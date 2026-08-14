import request from "supertest";
import express from "express";
import { container } from "tsyringe";
import { IEnvs } from "../../../src/domain/interfaces/infrastructure/plugins/envs.plugin.interface";
import { ITokenPlugin } from "../../../src/domain/interfaces/infrastructure/plugins/token.plugin.interface";
import { JwtPlugin } from "../../../src/infrastructure/plugins/jwt.plugin";
import { S3FileStoragePlugin } from "../../../src/infrastructure/plugins/s3FileStorage.plugin";
import { DevController } from "../../../src/presentation/controllers/dev.controller";
import { registerController } from "../../../src/presentation/routing/router.builder";
import { errorHandler } from "../../../src/presentation/middlewares/errorHandler.middleware";
import { IRequestContext } from "../../../src/domain/interfaces/infrastructure/plugins/request-context.plugin.interface";
import { AsyncRequestContextPlugin } from "../../../src/infrastructure/plugins/asyncRequestContext.plugin";
import { ILogger } from "../../../src/domain/interfaces/infrastructure/plugins/logger.plugin.interface";

// mock del S3FileStoragePlugin
jest.mock("../../../src/infrastructure/plugins/s3FileStorage.plugin");

describe("DevController (unit)", () => {
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

    // JwtPlugin publica la identidad en el contexto de la peticion.
    container.registerSingleton<IRequestContext>("IRequestContext", AsyncRequestContextPlugin);
    container.register<ILogger>("ILogger", {
      useValue: {
        info: jest.fn(), warn: jest.fn(), error: jest.fn(),
        debug: jest.fn(), trace: jest.fn(), http: jest.fn(),
      } as unknown as ILogger,
    });

    // El plugin de token se resuelve por DI desde las rutas
    container.register<ITokenPlugin>("ITokenPlugin", { useClass: JwtPlugin });

    // Mock de S3FileStoragePlugin
    (S3FileStoragePlugin as jest.Mock).mockImplementation(() => ({
      single: jest.fn().mockResolvedValue("https://fake-bucket.s3.amazonaws.com/file.txt"),
      array: jest.fn().mockResolvedValue([
        "https://fake-bucket.s3.amazonaws.com/file1.txt",
        "https://fake-bucket.s3.amazonaws.com/file2.txt",
      ]),
    }));

    // Inicializar Express y registrar las rutas de prueba. Cuelgan del mismo
    // router que el resto de la API, así que sus rutas son relativas y el
    // prefijo lo pone el montaje, igual que en index.route.
    app = express();
    app.use(express.json());

    const api = express.Router();
    const jwt = container.resolve<ITokenPlugin>("ITokenPlugin");
    registerController(api, DevController, container.resolve(DevController), jwt.middleware);
    app.use("/api", api);
    // Los rechazos los formatea el manejador global, igual que en el servidor.
    app.use(errorHandler);
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

  // =============================
  // ❌ Cuerpo que no es multipart
  // =============================
  describe("cuerpo equivocado", () => {
    // Es lo que mandaba la documentación cuando la ruta no declaraba su
    // `requestBody`: sin `Content-Type`, el constructor de busboy lanza. Eso
    // salía como un 500 con traza, cuando es un error de quien llama.
    for (const path of ["/api/upload-file", "/api/upload-files"]) {
      it(`${path} responde 400, no 500, sin Content-Type de multipart`, async () => {
        const res = await request(app).post(path).send({ nada: true });

        expect(res.status).toBe(400);
        expect(res.body).toMatchObject({ status: "error", code: "NOT_MULTIPART" });
      });
    }

    it("un multipart sin ficheros no revienta", async () => {
      const res = await request(app).post("/api/upload-file").field("campo", "valor");

      expect(res.status).toBe(400);
      expect(res.body.code).toBe("NO_FILE");
    });
  });

  it("responde una sola vez aunque lleguen varios ficheros a /upload-file", async () => {
    // Antes respondía dentro del `end` de cada fichero: el segundo provocaba un
    // ERR_HTTP_HEADERS_SENT.
    const res = await request(app)
      .post("/api/upload-file")
      .attach("file", Buffer.from("one"), "file1.txt")
      .attach("file", Buffer.from("two"), "file2.txt");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ path: "https://fake-bucket.s3.amazonaws.com/file.txt" });
  });
});
