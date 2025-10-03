// src/infrastructure/plugins/JwtPlugin.ts
import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload, SignOptions } from "jsonwebtoken";
import { ITokenPlugin } from "../../domain/interfaces/infrastructure/plugins/token.plugin.interface";
import { IEnvs } from "../../domain/interfaces/infrastructure/plugins/envs.plugin.interface";
import { container } from "tsyringe";

export class JwtPlugin implements ITokenPlugin{
  private readonly secret: string;
  private envs:IEnvs = container.resolve("IEnvs")
  constructor(secret?: string) {
    this.secret = secret ?? this.envs.getEnv("JWT_SECRET") ?? "super-secret-key";
  }

  /**
   * Genera un token firmado
   */
  generateToken(
    payload: Record<string, any>,
    expiresIn: SignOptions["expiresIn"] = "1h"
  ): string {
    const options: SignOptions = { expiresIn };
    return jwt.sign(payload, this.secret, options);
  }

  /**
   * Verifica un token manualmente
   */
  verifyToken(token: string): string | JwtPayload {
    return jwt.verify(token, this.secret);
  }

  /**
   * Middleware para proteger rutas
   */
  middleware = (req: Request, res: Response, next: NextFunction): void => {
    const authHeader = req.headers["authorization"];

    if (!authHeader) {
      res.status(401).json({ error: "No token provided" });
      return;
    }

    const [scheme, token] = authHeader.split(" ");

    if (scheme !== "Bearer" || !token) {
      res.status(401).json({ error: "Invalid token format" });
      return;
    }

    try {
      const decoded = jwt.verify(token, this.secret);
      (req as any).user = decoded; // attach al request
      next();
    } catch (error) {
      res.status(401).json({ error: "Invalid or expired token" });
    }
  };
}
