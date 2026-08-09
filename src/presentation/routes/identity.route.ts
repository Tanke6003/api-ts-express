// src/presentation/routes/identity.route.ts
import { container } from "tsyringe";
import type { Router } from "express";
import { ITokenPlugin } from "../../domain/interfaces/infrastructure/plugins/token.plugin.interface";
import { IIdentityController } from "../../domain/interfaces/presentation/controllers/identity.controller.interface";

/**
 * Identidad de la petición: quién es el usuario según el token.
 */
export class IdentityRoutes {
  private identityController: IIdentityController;
  private jwtPlugin: ITokenPlugin;

  constructor() {
    this.identityController = container.resolve<IIdentityController>("IIdentityController");
    this.jwtPlugin = container.resolve<ITokenPlugin>("ITokenPlugin");
  }

  public register(app: Router) {
    /**
     * @openapi
     * /api/me:
     *   get:
     *     tags:
     *       - Identity
     *     summary: Identidad resuelta a partir del token
     *     description: >
     *       Devuelve el usuario que la API extrajo del JWT. Es el mismo que el
     *       repositorio genérico escribe en las columnas CREATED_BY / UPDATED_BY.
     *     security:
     *       - bearerAuth: []
     *     responses:
     *       200:
     *         description: Identidad del usuario autenticado
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 id:
     *                   type: string
     *                   example: "7"
     *                 name:
     *                   type: string
     *                   example: Ruben
     *                 email:
     *                   type: string
     *                   nullable: true
     *                   example: ruben@example.com
     *                 requestId:
     *                   type: string
     *       401:
     *         description: Unauthorized
     */
    app.get(
      "/me",
      this.jwtPlugin.middleware,
      this.identityController.me.bind(this.identityController)
    );
  }
}
