// src/core/server.ts

import express, { Application } from "express";
import cors from "cors";
import { IndexRoutes } from "../presentation/routes/index.route";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi, { SwaggerUiOptions } from "swagger-ui-express";
import { swaggerOptions } from "./config/swagger.config";
import { httpLoggerMiddleware } from "../presentation/middlewares/httpLogger.middleware";
import {  injectable } from "tsyringe";

@injectable()
export class Server {
    private readonly port: number;
    public app: Application = express();
    private routes = IndexRoutes;
    constructor(
    
        port: number) {
        this.port = port;

    }

    // Configure middleware for the Express app
    async configureMiddleware() {
        // Middleware to parse JSON and urlencoded data
        this.app.use(express.json());
        // for parsing application/x-www-form-urlencoded
        this.app.use(express.urlencoded({ extended: true }));
        // Enable CORS for all routes
        this.app.use(cors());
        //limit request size to 50mb
        this.app.use(express.json({ limit: "50mb" }));
        //limit urlencoded request size to 50mb
        this.app.use(express.urlencoded({ limit: "50mb", extended: true }));
        // register http logs
        this.app.use(httpLoggerMiddleware);


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
        const swaggerSpec = swaggerJsdoc(swaggerOptions);

        // Swagger UI en /api-docs
        this.app.use("/api/swagger", swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
            swaggerOptions: {
                docExpansion: "none",
                persistAuthorization: true,
            },
            explorer: true,
            customSiteTitle: "API Docs",
        } as SwaggerUiOptions));
         this.app.get("/api/openapi.json", (_req, res) => {
            res.json(swaggerSpec);
        });
    }
    // Configure routes for the Express app
    async configureRoutes() {
        // Import and register additional routes
        this.routes.register(this.app);
        // Health check endpoint
        this.app.get("/health", (_req, res) => {
            res.status(200).send("OK");
        });
    }


async run() {
 
  await this.configureMiddleware();
  await this.configureRoutes();
  await this.configureScalar();
  await this.configureSwagger();


    this.app.listen(this.port, () => {
      console.log(`🚀 Server listening on port ${this.port}`);
      console.log(`🧪 To Test: http://localhost:${this.port}/api/users`);
      console.log(`🟢 Swagger: http://localhost:${this.port}/api/swagger`);
      console.log(`🌘 Scalar:  http://localhost:${this.port}/api/scalar`);
      console.log(`💖 Health:  http://localhost:${this.port}/health`);
    });


}
}