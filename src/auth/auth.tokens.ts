// src/auth/auth.tokens.ts
//
// Tabla de tokens propia del subsistema. Va aparte de la del proyecto a
// propósito: cuando esto salga a `@monolite/auth` se lleva sus identificadores
// consigo, y hasta entonces se ve de un vistazo qué pertenece a quién.
export const AUTH_TOKENS = {
  /** Lo implementa la aplicación: de dónde salen los usuarios. */
  IUserProvider: "IUserProvider",
  IPasswordHasher: "IPasswordHasher",
  IAuthService: "IAuthService",
  IAuthController: "IAuthController",
} as const;

export type AuthToken = (typeof AUTH_TOKENS)[keyof typeof AUTH_TOKENS];
