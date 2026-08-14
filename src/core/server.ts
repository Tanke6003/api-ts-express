// src/core/server.ts
import express, { Application } from "express";
import path from "path";
import cors from "cors";
import helmet from "helmet";
import { IndexRoutes } from "../presentation/routes/index.route";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi, { SwaggerUiOptions } from "swagger-ui-express";
import { container, injectable } from "tsyringe";
import { getSwaggerOptions } from "./config/swagger.config";
import {
  areDocsEnabled,
  buildCorsOptions,
  buildHelmetOptions,
  buildRateLimiter,
  resolveBodyLimit,
  resolveTrustProxy,
} from "./config/security.config";
import { ILogger } from "../domain/interfaces/infrastructure/plugins/logger.plugin.interface";
import { IEnvs } from "../domain/interfaces/infrastructure/plugins/envs.plugin.interface";
import { errorHandler, notFoundHandler } from "../presentation/middlewares/errorHandler.middleware";
import { requestContext } from "../presentation/middlewares/requestContext.middleware";
import { IRequestContext } from "../domain/interfaces/infrastructure/plugins/request-context.plugin.interface";
import { TOKENS } from "./di/tokens";

@injectable()
export class Server {
  private readonly port: number;
  public app: Application = express();
  private routes = IndexRoutes;

  constructor(port: number) {
    this.port = port;
  }

  /**
   * Cadena de middlewares. El orden es la mitad del trabajo: cada pieza asume
   * que las anteriores ya corrieron, y moverlas de sitio las deja sin efecto.
   * La política concreta —cupos, orígenes, límites— vive en `security.config`.
   */
  async configureMiddleware() {
    const envs: IEnvs = container.resolve(TOKENS.IEnvs);

    // Decir qué framework hay debajo no aporta nada y sí orienta a quien busca
    // una vulnerabilidad conocida.
    this.app.disable("x-powered-by");

    // Cuántos proxys de confianza hay delante. De esto depende qué IP ve el
    // limitador: mal puesto, o cuenta a todo el mundo como el balanceador, o se
    // cree la que diga el cliente.
    this.app.set("trust proxy", resolveTrustProxy(envs));

    // Lo primero de todo, incluso antes del parseo del cuerpo: asi hasta un
    // JSON mal formado se rechaza con su id de peticion, y el resto de capas
    // (logs, manejador de errores, auditoria) ven el contexto.
    const context: IRequestContext = container.resolve(TOKENS.IRequestContext);
    this.app.use(requestContext(context));

    const logger: ILogger = container.resolve(TOKENS.ILogger);

    // Antes que nada de lo que responde, para que las cabeceras acompañen
    // también a un 429 o a un rechazo de CORS.
    this.app.use(helmet(buildHelmetOptions(envs)));

    // Antes del parseo: a una petición que va a rechazarse no se le lee el
    // cuerpo, que es justo el trabajo que un abuso busca provocar.
    const limiter = buildRateLimiter(envs);
    if (limiter) this.app.use(limiter);

    // Antes del cuerpo también: un preflight no lleva ninguno.
    this.app.use(cors(buildCorsOptions(envs, logger)));

    const bodyLimit = resolveBodyLimit(envs);
    this.app.use(express.json({ limit: bodyLimit }));
    // `extended: false`: nada en el proyecto envía formularios —la interfaz de
    // ejemplo serializa a JSON—, así que basta el parser nativo.
    this.app.use(express.urlencoded({ limit: bodyLimit, extended: false }));

    this.app.use(logger.http());

    // Interfaz web de ejemplo (HTML + JS + Tailwind) servida desde /public.
    this.app.use(express.static(path.resolve(process.cwd(), "public")));
  }

  async configureScalar() {
    const { apiReference } = await import("@scalar/express-api-reference");
    this.app.use(
      "/api/scalar",
      apiReference({
        url: "/api/openapi.json",
        theme: "deepSpace",
      })
    );
  }

  async configureSwagger() {
    const swaggerSpec = swaggerJsdoc(getSwaggerOptions());

    this.app.use(
      "/api/swagger",
      swaggerUi.serve,
      swaggerUi.setup(swaggerSpec, {
        swaggerOptions: {
          docExpansion: "none",
          persistAuthorization: true,
        },
        explorer: true,
        customSiteTitle: "API Docs",
      } as SwaggerUiOptions)
    );

    this.app.get("/api/openapi.json", (_req, res) => {
      res.json(swaggerSpec);
    });
  }

  async configureRoutes() {
    this.routes.register(this.app);

    this.app.get("/health", (_req, res) => {
      res.status(200).json({
        status: "ok",
        // Útil para saber contra qué driver está corriendo la interfaz web.
        dataSource: (process.env.DATA_SOURCE || "dummy").toLowerCase(),
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
      });
    });

  }

  /**
   * 404 y manejador de errores. Se registra al final del todo, despues de las
   * rutas de negocio y de Swagger/Scalar: un manejador de errores registrado
   * antes de una ruta no cubre esa ruta, y el 404 se tragaria la documentacion.
   */
  configureErrorHandling() {
    this.app.use(notFoundHandler);
    this.app.use(errorHandler);
  }

  async run() {
    await this.configureMiddleware();
    await this.configureRoutes();

    // La documentación describe la superficie entera de la API, incluidos los
    // esquemas de entrada: fuera de desarrollo se publica sólo si se pide.
    const envs: IEnvs = container.resolve(TOKENS.IEnvs);
    if (areDocsEnabled(envs)) {
      await this.configureScalar();
      await this.configureSwagger();
    }

    this.configureErrorHandling();

    const docsEnabled = areDocsEnabled(envs);

    this.app.listen(this.port, () => {
      console.log(`Server running on port ${this.port}`);
      console.log(`UI:      http://localhost:${this.port}/`);
      console.log(`Users:   http://localhost:${this.port}/api/users`);
      // No se anuncia lo que no está montado: con la documentación apagada,
      // estas dos líneas mandarían a un 404.
      if (docsEnabled) {
        console.log(`Swagger: http://localhost:${this.port}/api/swagger`);
        console.log(`Scalar:  http://localhost:${this.port}/api/scalar`);
      }
      console.log(`Health:  http://localhost:${this.port}/health`);
    });
  }
}
