// src/core/di/tokens.ts
//
// Identificadores con los que se registra y se inyecta cada dependencia.
//
// tsyringe resuelve por string, así que una errata en un `@inject("IUsersServcie")`
// compila sin quejarse y revienta al construir el controlador, ya en marcha.
// Pasando siempre por esta tabla el compilador ve la errata y el editor completa
// el nombre.
//
// La clave y el valor son iguales a propósito: el valor es el que ya usaban los
// registros y los tests, y mantenerlo idéntico permite seguir buscando
// "IUsersService" y encontrar de un vistazo dónde se registra y dónde se inyecta.
export const TOKENS = {
  // ---------------------------------------------------------------- plugins --
  IEnvs: "IEnvs",
  ILogger: "ILogger",
  ITokenPlugin: "ITokenPlugin",
  IFileStorage: "IFileStorage",
  IRequestContext: "IRequestContext",
  /** Transacción en curso; la publica la unidad de trabajo. */
  ITransactionContext: "ITransactionContext",
  IHealthProbe: "IHealthProbe",

  // ------------------------------------------------------------ persistencia --
  // Un store es el repositorio genérico ya montado sobre el motor activo; el
  // repositorio de cada entidad lo recibe y le añade lo suyo.
  UsersStore: "UsersStore",
  BranchesStore: "BranchesStore",
  AppointmentsStore: "AppointmentsStore",
  AuditLogStore: "AuditLogStore",
  IUnitOfWork: "IUnitOfWork",

  // ----------------------------------------------------------- repositorios --
  IUsersRepository: "IUsersRepository",
  IBranchesRepository: "IBranchesRepository",
  IAppointmentsRepository: "IAppointmentsRepository",

  // -------------------------------------------------------------- servicios --
  IUsersService: "IUsersService",
  IBranchesService: "IBranchesService",
  IAppointmentsService: "IAppointmentsService",

  // ------------------------------------------------------------ controllers --
  IUsersController: "IUsersController",
  IBranchesController: "IBranchesController",
  IAppointmentsController: "IAppointmentsController",
  IIdentityController: "IIdentityController",
  IAuditController: "IAuditController",
  /** Utilidades de desarrollo: token de prueba y subida de ficheros. */
  IDevController: "IDevController",
} as const;

/** Cualquiera de los identificadores de arriba. */
export type Token = (typeof TOKENS)[keyof typeof TOKENS];
