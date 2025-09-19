// src/domain/interfaces/infrastructure/plugins/token.plugin.interface.ts
import { Request, Response, NextFunction } from "express";

/**
 * Interfaz genérica para manejo de tokens o autenticación
 */
export interface ITokenPlugin {
  /**
   * Genera un token / credencial
   * @param payload Información a incluir en el token
   * @param expiresIn Opcional: tiempo de expiración
   */
  generateToken(payload: Record<string, any>, expiresIn?: string | number): string;

  /**
   * Verifica un token / credencial
   * @param token Token a validar
   */
  verifyToken(token: string): Record<string, any> | string;

  /**
   * Middleware de Express para proteger rutas
   */
  middleware(req: Request, res: Response, next: NextFunction): void;
}
