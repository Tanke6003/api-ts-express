// src/presentation/routes/user.routes.ts

import { UsersController } from "../controllers/users.controller";
import { JwtPlugin } from "../../infrastructure/plugins/jwt.plugin";
import { IUsersController } from "../../domain/interfaces/presentation/controllers/users.controller.interface";
import { container } from "tsyringe";

export class UsersRoutes {
 private usersController: IUsersController;
  private JwtPlugin: JwtPlugin = new JwtPlugin();

  constructor() {
    this.usersController = container.resolve<IUsersController>("IUsersController");
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
    app.get("/users", this.usersController.getAllUsers.bind(this.usersController));

    /**
     * @openapi
     * /api/users/{id}:
     *   get:
     *     tags:
     *       - Users
     *     summary: Get user by ID
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: integer
     *     responses:
     *       200:
     *         description: User found
     *       404:
     *         description: User not found
     */
    app.get("/users/:id", this.usersController.getUserById.bind(this.usersController));

/**
 * @openapi
 * /api/users:
 *   post:
 *     tags:
 *       - Users
 *     summary: Create a new user
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/User'
 *     responses:
 *       201:
 *         description: User created
 */
app.post(
  "/users",
  this.JwtPlugin.middleware,
  this.usersController.createUser.bind(this.usersController)
);

    /**
     * @openapi
     * /api/users/{id}:
     *   put:
     *     tags:
     *       - Users
     *     summary: Update user by ID
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: integer
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             $ref: '#/components/schemas/User'
     *     responses:
     *       200:
     *         description: User updated
     *       404:
     *         description: User not found
     */
    app.put("/users/:id", this.usersController.updateUser.bind(this.usersController));

    /**
     * @openapi
     * /api/users/{id}:
     *   delete:
     *     tags:
     *       - Users
     *     summary: Delete user by ID
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: integer
     *     responses:
     *       204:
     *         description: User deleted
     *       404:
     *         description: User not found
     */
    app.delete("/users/:id", this.usersController.deleteUser.bind(this.usersController));
  }
}
