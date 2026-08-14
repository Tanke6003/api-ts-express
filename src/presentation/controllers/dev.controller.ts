// src/presentation/controllers/dev.controller.ts
import { Request, RequestHandler, Response } from "express";
import Busboy from "busboy";
import { inject, injectable } from "tsyringe";
import type { ITokenPlugin } from "../../domain/interfaces/infrastructure/plugins/token.plugin.interface";
import type { ILogger } from "../../domain/interfaces/infrastructure/plugins/logger.plugin.interface";
import type { IEnvs } from "../../domain/interfaces/infrastructure/plugins/envs.plugin.interface";
import { S3FileStoragePlugin } from "../../infrastructure/plugins/s3FileStorage.plugin";
import { TOKENS } from "../../core/di/tokens";
import { buildAuthRateLimiter } from "../../core/config/security.config";
import { ApiController, Get, Post } from "../routing/route.decorators";
import { z } from "zod";

/** Parámetros con los que se simula un usuario. Todos opcionales. */
const tokenQuerySchema = z.object({
  userId: z.string().optional().meta({ examples: ["7"] }),
  name: z.string().optional().meta({ examples: ["Ruben"] }),
  email: z.string().optional().meta({ examples: ["ruben@example.com"] }),
});

/**
 * Utilidades de desarrollo: generar un token y subir ficheros.
 *
 * No son parte de la plantilla, son andamiaje para poder probarla sin montar un
 * login. Antes vivían en `test.route.ts`; ahora son un controlador como el
 * resto para que no quede ningún fichero de rutas suelto.
 */
@injectable()
@ApiController("", { tag: "Dev", token: TOKENS.IDevController })
export class DevController {
  /**
   * Cupo propio del emisor de tokens, mucho más estrecho que el general: un
   * token es lo único que abre el resto de la API.
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

  /** Middlewares extra de la ruta de token; se leen al construir el router. */
  public get tokenRateLimit(): RequestHandler[] {
    return this.tokenGuards;
  }

  @Get("/generate-token", {
    summary: "Genera un JWT de desarrollo",
    description:
      "Atajo para probar la API sin montar un login. Los parámetros permiten simular distintos usuarios.",
    public: true,
    query: tokenQuerySchema,
    // El limitador se pide por función porque el decorador corre al cargar la
    // clase, antes de que exista la instancia que lo construyó con el entorno.
    use: (controller) => (controller as DevController).tokenRateLimit,
    responses: {
      200: { description: "Token firmado", ref: "Token" },
      429: "Demasiados intentos",
    },
  })
  public generateToken = (req: Request, res: Response): void => {
    // El id va en `sub`, el claim estándar del sujeto: es lo que lee el
    // contexto de la petición y lo que usan las reglas que dependen de quién
    // pide. Los parámetros permiten simular distintos usuarios en desarrollo.
    const userId = String(req.query.userId ?? "1");
    const name = String(req.query.name ?? "Dev User");
    const email = String(req.query.email ?? "dev@example.com");

    const token = this.jwtPlugin.generateToken({ sub: userId, userId, name, email });
    res.json({ token });
  };

  @Post("/upload-file", {
    summary: "Sube un fichero",
    public: true,
    responses: { 200: { description: "Fichero guardado", ref: "UploadedFile" } },
  })
  public uploadFile = (req: Request, res: Response): void => {
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
  };

  @Post("/upload-files", {
    summary: "Sube varios ficheros",
    public: true,
    responses: { 200: { description: "Ficheros guardados", ref: "UploadedFiles" } },
  })
  public uploadFiles = (req: Request, res: Response): void => {
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
  };
}
