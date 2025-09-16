// src/presentation/routes/index.routes.ts

import { UsersRoutes } from "./users.route"

export class IndexRoutes {
    public static register(app: any) {
        new UsersRoutes().register(app);
        // Future route registrations can be added here
    }
}