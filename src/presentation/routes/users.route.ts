// src/presentation/routes/user.routes.ts

import { UsersController } from '../controllers/users.controller';

export class UsersRoutes {
    private usersController: UsersController;

    constructor() {
        this.usersController = new UsersController();
    }

    public register(app: any) {
        app.get("/api/users", this.usersController.getAllUsers);
        
    }
}
