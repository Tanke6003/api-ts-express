// src/presentation/routes/test.route.ts

import { JwtPlugin } from "../../infrastructure/plugins/jwt.plugin";
import { Request, Response } from "express";

export class TestRoutes {
    private jwtPlugin: JwtPlugin;
    constructor() {
        this.jwtPlugin = new JwtPlugin();
    }   

    public register(app: any) {
/**
 * @openapi
 * /api/generate-token:
 *   get:
 *     tags:
 *       - Test
 *     summary: Test route
 *     description: A simple test route to verify the API is working
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *             example:
 *               message: API is working
 *     security:
 *       - bearerAuth: []
 */
app.get("/api/generate-token", (_req: Request, res: Response) => {
  // Lógica para generar un token (usualmente después de validar credenciales)
  const token = this.jwtPlugin.generateToken({ userId: 1 });
  res.json({ token });
});

}

}