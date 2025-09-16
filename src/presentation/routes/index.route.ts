// src/presentation/routes/index.routes.ts

import { TestRoutes } from "./test.route";
import { UsersRoutes } from "./users.route"

export class IndexRoutes {
    public static register(app: any) {
        new UsersRoutes().register(app);
        new TestRoutes().register(app);
        // Future route registrations can be added here
    }
}