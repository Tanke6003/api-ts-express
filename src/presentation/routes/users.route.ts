// src/presentation/routes/user.routes.ts

import { UsersController } from '../controllers/users.controller';

export class UsersRoutes {
    private usersController: UsersController;

    constructor() {
        this.usersController = new UsersController();
    }

    public register(app: any) {
/**
 * @openapi
 * /api/users:
 *   get:
 *     tags:
 *       - Users
 *     summary: Get all users
 *     description: Retrieve a list of all users
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: A list of users.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/User'
 */
        app.get("/api/users", this.usersController.getAllUsers);
        
    }
}
