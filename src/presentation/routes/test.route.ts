// src/presentation/routes/test.route.ts

import { JwtPlugin } from "../../infrastructure/plugins/jwt.plugin";
import { Request, Response } from "express";
import { NativeFileStoragePlugin } from "../../infrastructure/plugins/nativeFileStorage.plugin";
import Busboy from "busboy";
import { S3FileStoragePlugin } from "../../infrastructure/plugins/s3FileStorage.plugin";

export class TestRoutes {
  private jwtPlugin: JwtPlugin;
  constructor() {
    this.jwtPlugin = new JwtPlugin();
  }

  public register(app: any) {
    /**
     * @openapi
     * /api/generate-token:
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
    app.get("/api/generate-token", (_req: Request, res: Response) => {
      // Lógica para generar un token (usualmente después de validar credenciales)
      const token = this.jwtPlugin.generateToken({ userId: 1 });
      res.json({ token });
    });
    /**
     * @openapi
     * /api/upload-file:
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
    app.post("/api/upload-file", (req: Request, res: Response) => {
      const busboy = Busboy({ headers: req.headers });
//       const storage = new S3FileStoragePlugin(
//   "my-bucket",
//   "us-east-1",
//   "minioadmin",
//   "minioadmin",
//   "http://localhost:8000" // endpoint local
// );
      const storage = new S3FileStoragePlugin(
  "my-bucket",
  "us-east-1",
  "test",   // credenciales por defecto en LocalStack
  "test",   // credenciales por defecto en LocalStack
  "http://localhost:4566" // endpoint LocalStack
);

      
      busboy.on("file", async (_fieldname, file, info) => {
        const { filename } = info;
        const buffers: Buffer[] = [];

        file.on("data", (data) => buffers.push(data));
        file.on("end", async () => {
          try {
            const savedPath = await storage.single({
              buffer: Buffer.concat(buffers),
              originalname: filename,
            });
            res.json({ path: savedPath });
          } catch (err) {
            console.error(err);
            res.status(500).json({ error: "Error saving file" });
          }
        });
      });

      req.pipe(busboy);
    });
    /**
     * @openapi
     * /api/upload-files:
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
app.post("/api/upload-files", (req: Request, res: Response) => {
  const busboy = Busboy({ headers: req.headers });
      const storage = new S3FileStoragePlugin(
  "my-bucket",
  "us-east-1",
  "minioadmin",
  "minioadmin",
  "http://localhost:8000" // endpoint local
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

  busboy.on("finish", async () => {
    try {
      const savedPaths = await storage.array(filesData);
      res.json({ paths: savedPaths });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Error saving files" });
    }
  });

  req.pipe(busboy);
});

  }

}