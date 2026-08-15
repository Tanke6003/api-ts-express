// src/presentation/controllers/dev.controller.ts
import { NextFunction, Request, RequestHandler, Response } from "express";
import { AppError } from "../../core/errors/app-error";
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

/**
 * Topes de una subida.
 *
 * Sin ellos busboy acepta lo que le manden, y como el fichero se acumula en
 * memoria con `Buffer.concat` antes de guardarlo, una subida grande es una vía
 * directa a tumbar el proceso. El límite lo aplica el propio parser: corta el
 * flujo al llegar al tope en vez de leerlo entero y descartarlo después.
 */
const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
/** Ficheros por petición: uno en la ruta simple, diez en la múltiple. */
const MAX_FILES_SINGLE = 1;
const MAX_FILES_MANY = 10;

interface UploadLimits {
  maxFiles: number;
  maxFileSizeBytes: number;
}

/**
 * Cuerpo de una subida.
 *
 * Va a mano y no por Zod porque un fichero llega como flujo binario: no hay
 * esquema que validar, sólo un contrato que declarar para que la documentación
 * ofrezca el selector de fichero y mande el `Content-Type` correcto.
 */
const MULTIPART_SINGLE = {
  mediaType: "multipart/form-data",
  required: true,
  schema: {
    type: "object",
    properties: { file: { type: "string", format: "binary" } },
    required: ["file"],
  },
} as const;

const MULTIPART_MANY = {
  mediaType: "multipart/form-data",
  required: true,
  schema: {
    type: "object",
    properties: {
      files: { type: "array", items: { type: "string", format: "binary" } },
    },
    required: ["files"],
  },
} as const;

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
    description: `Un solo fichero, de hasta ${MAX_FILE_SIZE_MB} MB.`,
    public: true,
    requestBody: MULTIPART_SINGLE,
    responses: {
      200: { description: "Fichero guardado", ref: "UploadedFile" },
      400: "El cuerpo no es multipart/form-data, viene mal formado o trae más de un fichero",
      413: `El fichero supera los ${MAX_FILE_SIZE_MB} MB`,
      502: "El almacenamiento de ficheros no responde",
    },
  })
  public uploadFile = (req: Request, res: Response, next: NextFunction): void => {
    const limits = { maxFiles: MAX_FILES_SINGLE, maxFileSizeBytes: MAX_FILE_SIZE_BYTES };

    this.receiveFiles(req, res, next, limits, async (files) => {
      const [file] = files;
      if (!file) throw new AppError("No llegó ningún fichero", 400, true, { code: "NO_FILE" });

      return { path: await this.storage().single(file) };
    });
  };

  @Post("/upload-files", {
    summary: "Sube varios ficheros",
    description: `Hasta ${MAX_FILES_MANY} ficheros, de ${MAX_FILE_SIZE_MB} MB cada uno.`,
    public: true,
    requestBody: MULTIPART_MANY,
    responses: {
      200: { description: "Ficheros guardados", ref: "UploadedFiles" },
      400: `El cuerpo no es multipart/form-data, viene mal formado o trae más de ${MAX_FILES_MANY} ficheros`,
      413: `Algún fichero supera los ${MAX_FILE_SIZE_MB} MB`,
      502: "El almacenamiento de ficheros no responde",
    },
  })
  public uploadFiles = (req: Request, res: Response, next: NextFunction): void => {
    const limits = { maxFiles: MAX_FILES_MANY, maxFileSizeBytes: MAX_FILE_SIZE_BYTES };

    this.receiveFiles(req, res, next, limits, async (files) => ({
      paths: await this.storage().array(files),
    }));
  };

  private storage(): S3FileStoragePlugin {
    return new S3FileStoragePlugin(
      "my-bucket",
      "us-east-1",
      "minioadmin",
      "minioadmin",
      "http://localhost:9100" // endpoint local
    );
  }

  /**
   * Recoge el multipart entero y llama a `save` una sola vez, al terminar.
   *
   * Tres cosas que este envoltorio resuelve y que antes estaban mal:
   *
   *  - **Comprueba el `Content-Type` antes de tocar busboy.** Su constructor
   *    lanza si falta, y como el manejador es síncrono ese fallo salía como un
   *    500 con traza. Mandar el cuerpo equivocado es un error del cliente: es
   *    un 400 y con un mensaje que se entienda.
   *  - **Escucha el `error` de busboy.** Un multipart mal formado emite ese
   *    evento, y un `error` sin oyente en un EventEmitter tumba el proceso.
   *  - **Responde una sola vez.** Antes el de un fichero respondía dentro del
   *    `end` de *cada* fichero, así que dos adjuntos provocaban un segundo
   *    `res.json` y un ERR_HTTP_HEADERS_SENT.
   */
  private receiveFiles(
    req: Request,
    res: Response,
    next: NextFunction,
    limits: UploadLimits,
    save: (files: { buffer: Buffer; originalname: string }[]) => Promise<unknown>
  ): void {
    if (!req.is("multipart/form-data")) {
      next(
        new AppError(
          "El cuerpo debe enviarse como multipart/form-data con el fichero adjunto.",
          400,
          true,
          { code: "NOT_MULTIPART" }
        )
      );
      return;
    }

    // Los topes los aplica el parser: corta el flujo en cuanto se pasa, en vez
    // de leer el fichero entero para descartarlo después.
    const busboy = Busboy({
      headers: req.headers,
      limits: { files: limits.maxFiles, fileSize: limits.maxFileSizeBytes },
    });

    const files: { buffer: Buffer; originalname: string }[] = [];

    /**
     * Cierra la petición con un error, una sola vez.
     *
     * Al rechazar a mitad de una subida el cliente puede seguir mandando bytes,
     * así que se desconecta el parser y se drena lo que quede: sin eso la
     * conexión se queda a medias esperando a que alguien lea.
     */
    let settled = false;
    const fail = (error: AppError): void => {
      if (settled) return;
      settled = true;

      req.unpipe(busboy);
      req.resume();
      next(error);
    };

    busboy.on("file", (_fieldname, file, info) => {
      const chunks: Buffer[] = [];
      file.on("data", (data: Buffer) => chunks.push(data));

      // Busboy no lanza al pasarse de tamaño: trunca el flujo y avisa por aquí.
      // Si nadie escucha, se guardaría un fichero cortado como si estuviera bien.
      file.on("limit", () => {
        fail(
          new AppError(
            `El fichero "${info.filename}" supera el máximo de ${MAX_FILE_SIZE_MB} MB.`,
            413,
            true,
            { code: "FILE_TOO_LARGE" }
          )
        );
      });

      file.on("end", () => {
        if (file.truncated) return;
        files.push({ buffer: Buffer.concat(chunks), originalname: info.filename });
      });
    });

    // Igual que con el tamaño: los ficheros de más se ignoran en silencio salvo
    // que se atienda este aviso, y quien sube creería que entraron todos.
    busboy.on("filesLimit", () => {
      fail(
        new AppError(
          limits.maxFiles === 1
            ? "Esta ruta acepta un solo fichero; usa /upload-files para varios."
            : `No se pueden subir más de ${limits.maxFiles} ficheros en una petición.`,
          400,
          true,
          { code: "TOO_MANY_FILES" }
        )
      );
    });

    busboy.on("error", (error) => {
      fail(
        new AppError("No se pudo leer el cuerpo de la petición.", 400, true, {
          code: "MALFORMED_MULTIPART",
          cause: error,
        })
      );
    });

    busboy.on("finish", () => {
      if (settled) return;
      settled = true;

      // La parte asíncrona va aquí dentro y marcada con `void`: `on` espera un
      // manejador que no devuelva nada, y así no queda una promesa suelta.
      void (async () => {
        try {
          res.json(await save(files));
        } catch (error) {
          this.logger.error("No se pudieron guardar los ficheros", { error });

          // Lo que ya viene decidido —"no llegó ningún fichero"— pasa tal cual.
          if (error instanceof AppError) {
            next(error);
            return;
          }

          // El resto se envuelve a propósito. Si no, un ECONNREFUSED del
          // almacenamiento cae en el mapeo genérico de drivers y sale como
          // "la base de datos no está disponible", que manda a buscar el fallo
          // al sitio equivocado: aquí la base no ha intervenido.
          next(
            new AppError(
              "No se pudo guardar en el almacenamiento de ficheros. ¿Está levantado? " +
                "(docker compose up -d minio)",
              502,
              true,
              { code: "FILE_STORAGE_UNAVAILABLE", cause: error }
            )
          );
        }
      })();
    });

    req.pipe(busboy);
  }
}
