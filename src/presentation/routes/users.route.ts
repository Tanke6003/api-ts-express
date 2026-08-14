// src/presentation/routes/user.routes.ts

import type { Router } from "express";
import { inject, injectable } from "tsyringe";
import type { ITokenPlugin } from "../../domain/interfaces/infrastructure/plugins/token.plugin.interface";
import type { IUsersController } from "../../domain/interfaces/presentation/controllers/users.controller.interface";
import { validateBody, validateQuery } from "../middlewares/validate.middleware";
import { createUserSchema, paginationSchema, updateUserSchema } from "../../application/validators/users.validators";
import { TOKENS } from "../../core/di/tokens";

@injectable()
export class UsersRoutes {
  constructor(
    @inject(TOKENS.IUsersController) private readonly usersController: IUsersController,
    @inject(TOKENS.ITokenPlugin) private readonly jwtPlugin: ITokenPlugin
  ) {}

  public register(app: Router) {
    /**
     * @openapi
     * /users:
     *   get:
     *     tags:
     *       - Users
     *     summary: Get all users (paginated)
     *     description: Retrieve a paginated list of users
     *     security:
     *       - bearerAuth: []
     *     parameters:
     *       - in: query
     *         name: page
     *         schema:
     *           type: integer
     *           default: 1
     *         description: Page number
     *       - in: query
     *         name: limit
     *         schema:
     *           type: integer
     *           default: 10
     *         description: Items per page (max 100)
     *     responses:
     *       200:
     *         description: Paginated list of users
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/PaginatedUsers'
     *       401:
     *         description: Unauthorized
     */
    app.get(
      "/users",
      this.jwtPlugin.middleware,
      validateQuery(paginationSchema),
      this.usersController.getAllUsers.bind(this.usersController)
    );

    /**
     * @openapi
     * /users/{id}:
     *   get:
     *     tags:
     *       - Users
     *     summary: Get user by ID
     *     security:
     *       - bearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: integer
     *     responses:
     *       200:
     *         description: User found
     *         content:
     *           application/json:
     *             schema:
     *               $ref: '#/components/schemas/User'
     *       401:
     *         description: Unauthorized
     *       404:
     *         description: User not found
     */
    app.get(
      "/users/:id",
      this.jwtPlugin.middleware,
      this.usersController.getUserById.bind(this.usersController)
    );

    /**
     * @openapi
     * /users:
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
     *             type: object
     *             required: [name]
     *             properties:
     *               name:
     *                 type: string
     *                 minLength: 1
     *                 maxLength: 100
     *                 example: John Doe
     *     responses:
     *       201:
     *         description: User created
     *       400:
     *         description: Validation error
     *       401:
     *         description: Unauthorized
     */
    app.post(
      "/users",
      this.jwtPlugin.middleware,
      validateBody(createUserSchema),
      this.usersController.createUser.bind(this.usersController)
    );

    /**
     * @openapi
     * /users/{id}:
     *   put:
     *     tags:
     *       - Users
     *     summary: Update user by ID
     *     security:
     *       - bearerAuth: []
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
     *             type: object
     *             required: [name]
     *             properties:
     *               name:
     *                 type: string
     *                 minLength: 1
     *                 maxLength: 100
     *                 example: John Doe
     *     responses:
     *       200:
     *         description: User updated
     *       400:
     *         description: Validation error
     *       401:
     *         description: Unauthorized
     *       404:
     *         description: User not found
     */
    app.put(
      "/users/:id",
      this.jwtPlugin.middleware,
      validateBody(updateUserSchema),
      this.usersController.updateUser.bind(this.usersController)
    );

    /**
     * @openapi
     * /users/{id}:
     *   delete:
     *     tags:
     *       - Users
     *     summary: Delete user by ID
     *     security:
     *       - bearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: integer
     *     responses:
     *       204:
     *         description: User deleted
     *       401:
     *         description: Unauthorized
     *       404:
     *         description: User not found
     */
    app.delete(
      "/users/:id",
      this.jwtPlugin.middleware,
      this.usersController.deleteUser.bind(this.usersController)
    );
  }
}
