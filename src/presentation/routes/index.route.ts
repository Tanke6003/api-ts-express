// src/presentation/routes/index.route.ts
import express, { Application } from "express";
import { UsersRoutes } from "./users.route";
import { BranchesRoutes } from "./branches.route";
import { AppointmentsRoutes } from "./appointments.route";
import { IdentityRoutes } from "./identity.route";
import { TestRoutes } from "./test.route";

export class IndexRoutes {
  public static register(app: Application) {
    // All domain routes are mounted under /api
    const apiRouter = express.Router();
    new UsersRoutes().register(apiRouter);
    new BranchesRoutes().register(apiRouter);
    new AppointmentsRoutes().register(apiRouter);
    new IdentityRoutes().register(apiRouter);
    app.use("/api", apiRouter);

    // Utility routes (token generation, file upload) already include /api prefix
    new TestRoutes().register(app);
  }
}
