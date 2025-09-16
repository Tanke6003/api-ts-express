// src/core/server.ts

import express, { Application } from "express";
import cors from "cors";
import { IndexRoutes } from "../presentation/routes/index.route";

import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi, { SwaggerUiOptions } from "swagger-ui-express";
import { swaggerOptions } from "./config/swagger.config";
import { WinstonPlugin } from "../infrastructure/plugins/winston.plugin";


export class Server {

    private readonly port: number;
    private app: Application = express();
    private routes = IndexRoutes;

    constructor(port: number) {
        this.port = port;
    }

    // Configure middleware for the Express app
    async configureMiddleware() {
        // Middleware to parse JSON and urlencoded data
        this.app.use(express.json());
        // for parsing application/x-www-form-urlencoded
        this.app.use(express.urlencoded({ extended: true }));
        // Enable CORS for all routes
        this.app.use(cors())
        //limit request size to 50mb
        this.app.use(express.json({ limit: '50mb' }));
        //limit urlencoded request size to 50mb
        this.app.use(express.urlencoded({ limit: '50mb', extended: true }));
       
    }   

    async configureScalar() {
        const swaggerSpec = swaggerJsdoc(swaggerOptions);


        this.app.get("/api/openapi.json", (_req, res) => {
    res.json(swaggerSpec);
  });

  // Scalar API Reference en /reference (dynamic import para ESM)
  try {
    const { apiReference } = await import("@scalar/express-api-reference");
    this.app.use(
      "/api/scalar",
      apiReference({
        url: "/api/openapi.json",
        theme: "purple",
      })
    );
  } catch (err) {
    console.warn("Scalar API Reference no pudo cargarse:", err);
  }
    }
        async configureSwagger() {
      const swaggerSpec = swaggerJsdoc(swaggerOptions);

  // Swagger UI en /api-docs
  this.app.use("/api/swagger", swaggerUi.serve, swaggerUi.setup(swaggerSpec,{
    swaggerOptions: {
        docExpansion: "none",
        persistAuthorization: true,

    },
    explorer: true,
        customSiteTitle: "API Docs",
        // customCss: `
        // .swagger-ui .topbar { background-color: #4CAF50; }
        // .swagger-ui .topbar a { color: white; font-weight: bold; }
        // .swagger-ui .info { background-color: #f0f0f0; padding: 10px; border-radius: 5px; } 
        // .swagger-ui .opblock { border-radius: 5px; margin-bottom: 10px; }
        // .swagger-ui .opblock-summary { background-color: #e0e0e0; border-radius: 5px; }
        // .swagger-ui .opblock-summary:hover { background-color: #d0d0d0; }
        // .swagger-ui .btn.authorize { background-color: #4CAF50; color: white; }
        // .swagger-ui .btn.authorize:hover { background-color: #45a049; }
        // .swagger-ui .responses-table { border-radius: 5px; }
        // .swagger-ui .response-col_status { font-weight: bold; }
        // .swagger-ui .response-col_description { font-style: italic; }
        // .swagger-ui .model-box { border-radius: 5px; }
        // .swagger-ui .model-box:hover { box-shadow: 0 0 10px rgba(0, 0, 0, 0.1); }
        // .swagger-ui .parameter__name { font-weight: bold; }
        // .swagger-ui .parameter__in { font-style: italic; color: #555; }
        // .swagger-ui .parameter__required { color: red; font-weight: bold; }
        // .swagger-ui .parameter__type { color: #007bff; }
        // .swagger-ui .tab { border-radius: 5px; }
        // .swagger-ui .tab:hover { background-color: #f0f0f0; }
        // .swagger-ui .tab.active { background-color: #e0e0e0; font-weight: bold; }
        // `,
        
  } as SwaggerUiOptions));
    }
    // Configure routes for the Express app
    async configureRoutes() {
        // TODO: Add Swagger setup here

        // Import and register additional routes
        this.routes.register(this.app);
    }
    // Start the Express server and listen on the specified port
    async run() {
        let looger = new WinstonPlugin();
        await this.configureMiddleware();
        await this.configureRoutes();
        await this.configureScalar();
         //configure swagger
        await this.configureSwagger();
        this.app.listen(this.port, () => {
            console.log(`🚀          Server listening on port ${this.port}`);
            console.log(`🧪 To Test: http://localhost:${this.port}/api/users`);
            // console.log(`🟢 Swagger: http://localhost:${this.port}/api/swagger`);
            console.log(`🌘 Scalar:  http://localhost:${this.port}/api/scalar`);

             console.log(`🟢 Swagger: http://localhost:${this.port}/api/swagger`);
        

        });
        looger.debug(`Server started on port ${this.port}`);
    }
}


