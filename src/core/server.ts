// src/core/server.ts
import express, { Application } from "express";
import path from "path";
import cors from "cors";
import { IndexRoutes } from "../presentation/routes/index.route";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi, { SwaggerUiOptions } from "swagger-ui-express";
import { container, injectable } from "tsyringe";
import { getSwaggerOptions } from "./config/swagger.config";
import { ILogger } from "../domain/interfaces/infrastructure/plugins/logger.plugin.interface";
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

  async configureMiddleware() {
    // Lo primero de todo, incluso antes del parseo del cuerpo: asi hasta un
    // JSON mal formado se rechaza con su id de peticion, y el resto de capas
    // (logs, manejador de errores, auditoria) ven el contexto.
    const context: IRequestContext = container.resolve(TOKENS.IRequestContext);
    this.app.use(requestContext(context));

    this.app.use(express.json({ limit: "50mb" }));
    this.app.use(express.urlencoded({ limit: "50mb", extended: true }));
    this.app.use(cors());

    const logger: ILogger = container.resolve(TOKENS.ILogger);
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
    await this.configureScalar();
    await this.configureSwagger();
    this.configureErrorHandling();

    this.app.listen(this.port, () => {
      console.log(`Server running on port ${this.port}`);
      console.log(`UI:      http://localhost:${this.port}/`);
      console.log(`Users:   http://localhost:${this.port}/api/users`);
      console.log(`Swagger: http://localhost:${this.port}/api/swagger`);
      console.log(`Scalar:  http://localhost:${this.port}/api/scalar`);
      console.log(`Health:  http://localhost:${this.port}/health`);
    });
  }
}
