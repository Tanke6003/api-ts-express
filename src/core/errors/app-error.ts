/** Detalle de validación campo a campo. */
export interface ErrorDetail {
  field: string;
  message: string;
}

export interface AppErrorOptions {
  /** Código estable para el cliente, p.ej. `APPOINTMENT_OVERLAP`. */
  code?: string;
  errors?: ErrorDetail[];
  /** Error original; se conserva para poder diagnosticar la causa raíz. */
  cause?: unknown;
}

export class AppError extends Error {
  public readonly code?: string;
  public readonly errors?: ErrorDetail[];

  constructor(
    public readonly message: string,
    public readonly statusCode: number = 500,
    public readonly isOperational = true,
    options: AppErrorOptions = {}
  ) {
    // `cause` es estándar desde ES2022: encadena el error original sin perderlo,
    // que es lo que permite al manejador global reconocer un ORA-00001 aunque
    // vaya envuelto en dos capas de repositorio.
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "AppError";
    this.code = options.code;
    this.errors = options.errors;
    Error.captureStackTrace(this, this.constructor);
  }
}
