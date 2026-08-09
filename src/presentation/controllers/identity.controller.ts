// src/presentation/controllers/identity.controller.ts
import { Request, Response, NextFunction } from "express";
import { inject, injectable } from "tsyringe";
import type { IRequestContext } from "../../domain/interfaces/infrastructure/plugins/request-context.plugin.interface";
import { IIdentityController } from "../../domain/interfaces/presentation/controllers/identity.controller.interface";
import { BaseController } from "./base.controller";

/**
 * Publica la identidad que la API resolvió del token: el mismo usuario que el
 * repositorio genérico escribe en las columnas de auditoría.
 *
 * Lee los claims desde `BaseController`, no del `Request`, que es justamente lo
 * que evita repetir la extracción en cada controlador.
 */
@injectable()
export class IdentityController extends BaseController implements IIdentityController {
  constructor(@inject("IRequestContext") context: IRequestContext) {
    super(context);
  }

  public me = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // La ruta va detrás del guard de JWT, así que aquí siempre hay usuario:
      // si faltara sería un error de cableado y conviene que se note.
      const id = this.requireUserId();

      res.json({
        id,
        name: this.userName,
        email: this.userEmail,
        requestId: this.requestId,
      });
    } catch (err) {
      next(err);
    }
  };
}
