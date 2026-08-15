// src/auth/contracts.ts
//
// Los contratos de la autenticación. Es el único fichero que una aplicación
// necesita leer para conectar la suya: el resto del subsistema depende de estas
// interfaces y no de cómo estén guardados los usuarios.

/** Usuario tal y como lo entiende la autenticación, no como lo guarda la app. */
export interface AuthUser {
  id: string;
  name: string;
  email: string | null;
  /** Vacío es válido: un usuario sin roles sigue estando autenticado. */
  roles: string[];
}

/** El usuario más lo único que no debe salir de aquí. */
export interface AuthUserWithSecret extends AuthUser {
  passwordHash: string;
}

/**
 * De dónde salen los usuarios.
 *
 * Lo implementa la aplicación, y es la pieza que impide que el framework le
 * imponga una tabla, unas columnas o un motor. Puede leer de la base, de un
 * LDAP o de un array en memoria: al subsistema le da igual.
 */
export interface IUserProvider {
  /** `null` si no existe. Nunca lanza por "no encontrado". */
  findByEmail(email: string): Promise<AuthUserWithSecret | null>;
}

/**
 * Cómo se guardan y comprueban las contraseñas.
 *
 * Se declara como contrato para poder cambiar de algoritmo sin tocar el resto,
 * que es lo que acaba pasando: lo que hoy es suficiente dentro de cinco años no
 * lo será.
 */
export interface IPasswordHasher {
  hash(plain: string): Promise<string>;
  /** Comparación en tiempo constante; `false` también si el hash es ilegible. */
  verify(plain: string, hash: string): Promise<boolean>;
}

export interface Credentials {
  email: string;
  password: string;
}

export interface AuthResult {
  token: string;
  /** Segundos que dura el token; el cliente decide cuándo renovar. */
  expiresIn: number;
  user: AuthUser;
}
