// src/presentation/middlewares/requestContext.middleware.ts
import { Request, Response, NextFunction, RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import type { JwtPayload } from "jsonwebtoken";
import type {
  CurrentUser,
  IRequestContext,
} from "../../domain/interfaces/infrastructure/plugins/request-context.plugin.interface";
import { SYSTEM_USER } from "../../infrastructure/plugins/asyncRequestContext.plugin";

/** Cabecera con la que se propaga —o se recibe— el identificador de petición. */
export const REQUEST_ID_HEADER = "x-request-id";

/**
 * Nombres de claim que se prueban, en orden, para obtener un nombre legible.
 * La lista cubre lo que suelen emitir los proveedores habituales (OIDC, Azure
 * AD / ADFS) además del token de desarrollo de este proyecto.
 */
const NAME_CLAIMS = ["name", "nameComplete", "preferred_username", "samaccountname", "username"];
const EMAIL_CLAIMS = ["email", "emails", "upn"];
const ID_CLAIMS = ["sub", "userId", "id", "oid"];

function firstClaim(payload: Record<string, unknown>, claims: string[]): string | null {
  for (const claim of claims) {
    const value = payload[claim];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

/**
 * Traduce el payload del JWT a la identidad que usa la auditoría. Si el token no
 * trae nombre, se cae al email y luego al id, para escribir algo identificable
 * en `CREATED_BY` en vez de `System`.
 */
export function toCurrentUser(payload: string | JwtPayload | undefined): CurrentUser | null {
  if (!payload || typeof payload !== "object") return null;

  const claims = payload as Record<string, unknown>;
  const id = firstClaim(claims, ID_CLAIMS);
  const email = firstClaim(claims, EMAIL_CLAIMS);
  const name = firstClaim(claims, NAME_CLAIMS) ?? email ?? id;

  if (!name) return null;
  return { id, name, email };
}

/**
 * Abre el contexto de la petición y deja dentro todo lo que venga después.
 *
 * Va **antes** de las rutas para que hasta un error temprano tenga `requestId`,
 * y lee el usuario de forma perezosa: cuando este middleware corre, el guard de
 * JWT todavía no ha puesto `req.user`, así que el contexto se completa en
 * cuanto la ruta autenticada lo hace (ver `attachUser`).
 */
export function requestContext(context: IRequestContext): RequestHandler {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Se respeta el id que venga de un proxy o de otro servicio, para poder
    // seguir una misma operación a través de varios saltos.
    const incoming = req.headers[REQUEST_ID_HEADER];
    const requestId = typeof incoming === "string" && incoming.length > 0 ? incoming : randomUUID();

    res.setHeader(REQUEST_ID_HEADER, requestId);

    context.run({ requestId, user: null }, () => {
      next();
    });
  };
}

/** Nombre a registrar en auditoría para la petición en curso. */
export function currentUserName(context: IRequestContext): string {
  return context.getCurrentUser()?.name ?? SYSTEM_USER;
}
