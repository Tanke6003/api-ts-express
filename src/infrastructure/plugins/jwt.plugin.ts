// src/infrastructure/plugins/JwtPlugin.ts
import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload, SignOptions } from "jsonwebtoken";
import { inject, injectable } from "tsyringe";
import { ITokenPlugin } from "../../domain/interfaces/infrastructure/plugins/token.plugin.interface";
import type { IEnvs } from "../../domain/interfaces/infrastructure/plugins/envs.plugin.interface";
import type { IRequestContext } from "../../domain/interfaces/infrastructure/plugins/request-context.plugin.interface";
import { toCurrentUser } from "../../presentation/middlewares/requestContext.middleware";
import { AppError } from "../../core/errors/app-error";

@injectable()
export class JwtPlugin implements ITokenPlugin{
  private readonly secret: string;

  constructor(
    @inject("IEnvs") private readonly envs: IEnvs,
    // Opcional a propósito: el plugin sigue siendo construible a mano (tests,
    // scripts) sin montar el contexto de petición.
    @inject("IRequestContext") private readonly context?: IRequestContext
  ) {
    const secret = this.envs.getEnv("JWT_SECRET");
    if (!secret) {
      throw new Error(
        "[JwtPlugin] JWT_SECRET is not set. Refusing to sign tokens with an insecure default."
      );
    }
    this.secret = secret;
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

    // Los rechazos se delegan en el manejador global para que un 401 tenga el
    // mismo formato —código, id de petición— que el resto de errores de la API.
    if (!authHeader) {
      next(new AppError("No token provided", 401, true, { code: "NO_TOKEN" }));
      return;
    }

    const [scheme, token] = authHeader.split(" ");

    if (scheme !== "Bearer" || !token) {
      next(new AppError("Invalid token format", 401, true, { code: "INVALID_TOKEN_FORMAT" }));
      return;
    }

    try {
      const decoded = jwt.verify(token, this.secret);
      req.user = decoded; // attach al request

      // Único punto donde se valida el token, así que también es el único sitio
      // donde hace falta publicar la identidad para la auditoría. Se muta el
      // store en curso para no perder el requestId que abrió el middleware de
      // contexto.
      const store = this.context?.get();
      if (store) store.user = toCurrentUser(decoded);

      next();
    } catch (error) {
      // Se pasa el error de jsonwebtoken tal cual: el manejador global
      // distingue un token expirado de uno inválido a partir de su `name`.
      next(error);
    }
  };
}
