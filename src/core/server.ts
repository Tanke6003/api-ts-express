// src/core/server.ts
import express, { Application } from "express";
import cors from "cors";
import { IndexRoutes } from "../presentation/routes/index.route";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi, { SwaggerUiOptions } from "swagger-ui-express";
import { container, injectable } from "tsyringe";
import { getSwaggerOptions } from "./config/swagger.config";
import { ILogger } from "../domain/interfaces/infrastructure/plugins/logger.plugin.interface";
import { errorHandler } from "../presentation/middlewares/errorHandler.middleware";

@injectable()
export class Server {
  private readonly port: number;
  public app: Application = express();
  private routes = IndexRoutes;

  constructor(port: number) {
    this.port = port;
  }

  async configureMiddleware() {
    this.app.use(express.json({ limit: "50mb" }));
    this.app.use(express.urlencoded({ limit: "50mb", extended: true }));
    this.app.use(cors());
    const logger: ILogger = container.resolve("ILogger");
    this.app.use(logger.http());
  }

  async configureScalar() {
    const { apiReference } = await import("@scalar/express-api-reference");
    this.app.use(
      "/api/scalar",
      apiReference({
        url: "/api/openapi.json",
        theme: "purple",
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
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
      });
    });

    // Global error handler — must be registered last
    this.app.use(errorHandler);
  }

  async run() {
    await this.configureMiddleware();
    await this.configureRoutes();
    await this.configureScalar();
    await this.configureSwagger();

    this.app.listen(this.port, () => {
      console.log(`Server running on port ${this.port}`);
      console.log(`Users:   http://localhost:${this.port}/api/users`);
      console.log(`Swagger: http://localhost:${this.port}/api/swagger`);
      console.log(`Scalar:  http://localhost:${this.port}/api/scalar`);
      console.log(`Health:  http://localhost:${this.port}/health`);
    });
  }
}
