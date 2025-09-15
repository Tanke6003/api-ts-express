// src/core/server.ts

import express, { Application } from "express";
import cors from "cors";
import { IndexRoutes } from "../presentation/routes/index.route";




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

    // Configure routes for the Express app
    async configureRoutes() {
        // TODO: Add Swagger setup here

        // Import and register additional routes
        this.routes.register(this.app);
    }
    // Start the Express server and listen on the specified port
    async run() {
        await this.configureMiddleware();
        await this.configureRoutes();
        console.log("Server started");
        this.app.listen(this.port, () => {
            console.log(`🚀          Server listening on port ${this.port}`);
            console.log(`🧪 To Test: http://localhost:${this.port}/api/users`);
            // console.log(`🟢 Swagger: http://localhost:${this.port}/api/swagger`);
            // console.log(`🌘 Scalar:  http://localhost:${this.port}/api/scalar`);
        });
    }
}
