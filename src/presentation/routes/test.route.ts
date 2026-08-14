// src/presentation/routes/test.route.ts

import type { ITokenPlugin } from "../../domain/interfaces/infrastructure/plugins/token.plugin.interface";
import type { ILogger } from "../../domain/interfaces/infrastructure/plugins/logger.plugin.interface";
import type { IEnvs } from "../../domain/interfaces/infrastructure/plugins/envs.plugin.interface";
import { Request, RequestHandler, Response, Router } from "express";
import Busboy from "busboy";
import { S3FileStoragePlugin } from "../../infrastructure/plugins/s3FileStorage.plugin";
import { inject, injectable } from "tsyringe";
import { TOKENS } from "../../core/di/tokens";
import { buildAuthRateLimiter } from "../../core/config/security.config";

@injectable()
export class TestRoutes {
  /**
   * Cupo propio, mucho más estrecho que el general: un token es lo único que
   * abre el resto de la API, así que es lo primero que alguien pedirá en bucle.
   */
  private readonly tokenGuards: RequestHandler[];

  constructor(
    @inject(TOKENS.ITokenPlugin) private readonly jwtPlugin: ITokenPlugin,
    @inject(TOKENS.ILogger) private readonly logger: ILogger,
    @inject(TOKENS.IEnvs) envs: IEnvs
  ) {
    const limiter = buildAuthRateLimiter(envs);
    this.tokenGuards = limiter ? [limiter] : [];
  }

  public register(app: Router) {
    /**
     * @openapi
     * /generate-token:
     *   get:
     *     tags:
     *       - Test
     *     summary: Test route
     *     description: A simple test route to verify the API is working
     *     responses:
     *       200:
     *         description: Successful response
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 message:
     *                   type: string
     *             example:
     *               message: API is working
     *     security:
     *       - bearerAuth: []
     */
    app.get("/generate-token", ...this.tokenGuards, (req: Request, res: Response) => {
      // Lógica para generar un token (usualmente después de validar credenciales).
      // El id va en `sub`, el claim estándar del sujeto: es lo que lee el
      // contexto de la petición y lo que usan las reglas que dependen de quién
      // pide. Los parámetros permiten simular distintos usuarios en desarrollo.
      const userId = String(req.query.userId ?? "1");
      const name = String(req.query.name ?? "Dev User");
      const email = String(req.query.email ?? "dev@example.com");

      const token = this.jwtPlugin.generateToken({ sub: userId, userId, name, email });
      res.json({ token });
    });
    /**
     * @openapi
     * /upload-file:
     *   post:
     *     tags:
     *       - File
     *     summary: Upload a file
     *     description: Endpoint para subir un archivo al servidor
     *     requestBody:
     *       required: true
     *       content:
     *         multipart/form-data:
     *           schema:
     *             type: object
     *             properties:
     *               file:
     *                 type: string
     *                 format: binary
     *     responses:
     *       200:
     *         description: Archivo subido exitosamente
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 path:
     *                   type: string
     *             example:
     *               path: uploads/1727012789000-foto.png
     */
    app.post("/upload-file", (req: Request, res: Response) => {
      const busboy = Busboy({ headers: req.headers });
      const storage = new S3FileStoragePlugin(
  "my-bucket",
  "us-east-1",
  "minioadmin",
  "minioadmin",
  "http://localhost:9100" // endpoint local
);


      
      busboy.on("file", (_fieldname, file, info) => {
        const { filename } = info;
        const buffers: Buffer[] = [];

        file.on("data", (data) => buffers.push(data));
        // `on` espera un manejador que no devuelva nada, así que la parte
        // asíncrona va dentro y se marca con `void`: los errores se atienden
        // aquí mismo y no queda una promesa suelta que nadie observe.
        file.on("end", () => {
          void (async () => {
            try {
              const savedPath = await storage.single({
                buffer: Buffer.concat(buffers),
                originalname: filename,
              });
              res.json({ path: savedPath });
            } catch (err) {
              this.logger.error("No se pudo guardar el fichero", { err });
              res.status(500).json({ error: "Error saving file" });
            }
          })();
        });
      });

      req.pipe(busboy);
    });
    /**
     * @openapi
     * /upload-files:
     *   post:
     *     tags:
     *       - File
     *     summary: Upload multiple files
     *     description: Endpoint para subir varios archivos al servidor
     *     requestBody:
     *       required: true
     *       content:
     *         multipart/form-data:
     *           schema:
     *             type: object
     *             properties:
     *               files:
     *                 type: array
     *                 items:
     *                   type: string
     *                   format: binary
     *     responses:
     *       200:
     *         description: Archivos subidos exitosamente
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 paths:
     *                   type: array
     *                   items:
     *                     type: string
     *             example:
     *               paths: ["uploads/1727012789000-foto1.png", "uploads/1727012789000-foto2.png"]
     */
app.post("/upload-files", (req: Request, res: Response) => {
  const busboy = Busboy({ headers: req.headers });
        const storage = new S3FileStoragePlugin(
  "my-bucket",
  "us-east-1",
  "minioadmin",
  "minioadmin",
  "http://localhost:9100" // endpoint local
);


  const filesData: { buffer: Buffer; originalname: string }[] = [];

  busboy.on("file", (_fieldname, file, info) => {
    const { filename } = info;
    const buffers: Buffer[] = [];

    file.on("data", (data) => buffers.push(data));
    file.on("end", () => {
      filesData.push({ buffer: Buffer.concat(buffers), originalname: filename });
    });
  });

  busboy.on("finish", () => {
    void (async () => {
      try {
        const savedPaths = await storage.array(filesData);
        res.json({ paths: savedPaths });
      } catch (err) {
        this.logger.error("No se pudieron guardar los ficheros", { err });
        res.status(500).json({ error: "Error saving files" });
      }
    })();
  });

  req.pipe(busboy);
});

  }

}