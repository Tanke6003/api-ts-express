// src/presentation/routes/identity.route.ts
import { container } from "tsyringe";
import type { Request, Response, Router } from "express";
import { ITokenPlugin } from "../../domain/interfaces/infrastructure/plugins/token.plugin.interface";
import { IRequestContext } from "../../domain/interfaces/infrastructure/plugins/request-context.plugin.interface";

/**
 * Identidad de la petición: quién es el usuario según el token.
 *
 * Es el equivalente del `BaseApiController` de .NET, que expone los claims a
 * los controladores; aquí se publica como endpoint para poder comprobar qué
 * identidad resolvió la API —la misma que acaba en `CREATED_BY`—.
 */
export class IdentityRoutes {
  private jwtPlugin: ITokenPlugin;
  private context: IRequestContext;

  constructor() {
    this.jwtPlugin = container.resolve<ITokenPlugin>("ITokenPlugin");
    this.context = container.resolve<IRequestContext>("IRequestContext");
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
     *                   nullable: true
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
    app.get("/me", this.jwtPlugin.middleware, (_req: Request, res: Response) => {
      const user = this.context.getCurrentUser();

      res.json({
        id: this.context.getCurrentUserId(),
        name: user?.name ?? null,
        email: user?.email ?? null,
        requestId: this.context.getRequestId(),
      });
    });
  }
}
