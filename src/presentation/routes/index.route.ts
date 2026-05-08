// src/presentation/routes/index.route.ts
import express, { Application } from "express";
import { UsersRoutes } from "./users.route";
import { TestRoutes } from "./test.route";

export class IndexRoutes {
  public static register(app: Application) {
    // All domain routes are mounted under /api
    const apiRouter = express.Router();
    new UsersRoutes().register(apiRouter);
    app.use("/api", apiRouter);

    // Utility routes (token generation, file upload) already include /api prefix
    new TestRoutes().register(app);
  }
}
