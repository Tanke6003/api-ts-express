# Architecture

This project follows **Clean Architecture** (also known as Layered Architecture or Hexagonal Architecture). The goal is to keep business logic independent of frameworks, databases, and delivery mechanisms.

---

## Layers

```
┌─────────────────────────────────────────────────────┐
│                  Presentation                        │
│         (Express routes, controllers, middlewares)   │
├─────────────────────────────────────────────────────┤
│                  Application                         │
│         (Services, Use Cases, DTOs)                  │
├─────────────────────────────────────────────────────┤
│                  Domain                              │
│         (Interfaces, Models — no dependencies)       │
├─────────────────────────────────────────────────────┤
│                  Infrastructure                      │
│         (Repositories, DataSources, Plugins)         │
└─────────────────────────────────────────────────────┘
```

The dependency rule: **inner layers know nothing about outer layers**. Domain has zero imports from infrastructure. Application imports only from Domain. Infrastructure implements Domain interfaces.

---

## Directory map

```
src/
├── main.ts                          # Bootstrap: loads container, starts Server
├── core/
│   ├── config/
│   │   └── swagger.config.ts        # Swagger / OpenAPI options
│   ├── di/
│   │   └── container.ts             # tsyringe DI registrations
│   └── errors/
│       └── app-error.ts             # AppError — operational error class
│
├── presentation/                    # HTTP layer — knows Express
│   ├── controllers/
│   │   └── users.controller.ts      # Handles req/res, delegates to service
│   ├── middlewares/
│   │   ├── httpLogger.middleware.ts  # Pino HTTP middleware
│   │   └── errorHandler.middleware.ts # Global error handler (last middleware)
│   └── routes/
│       ├── index.route.ts           # Mounts all routers under /api
│       ├── users.route.ts           # OpenAPI-annotated CRUD routes
│       ├── branches.route.ts        # Sucursales
│       ├── appointments.route.ts    # Citas
│       └── test.route.ts            # Token generation & file upload (dev)
│
├── application/                     # Business logic — knows Domain only
│   ├── dtos/                        # Request/response shapes (OpenAPI schemas)
│   ├── queries/
│   │   └── include.query.ts         # loadRelated — EF-style Include, batched
│   ├── services/                    # Business rules & compound queries
│   └── validators/                  # Zod schemas per module
│
├── domain/                          # Core — zero external dependencies
│   ├── interfaces/
│   │   ├── application/services/    # IUsersService, IBranchesService, IAppointmentsService
│   │   ├── infrastructure/
│   │   │   ├── datasources/         # IUsersDataSource
│   │   │   ├── plugins/             # ILogger, IEnvs, ITokenPlugin, IFileStorage,
│   │   │   │                        #   ISqlConnectionPlugin, IOracleConnectionPlugin
│   │   │   └── repositories/        # IGenericRepository, IUnitOfWork, per-module contracts
│   │   └── presentation/controllers/
│   └── models/                      # IUser, IBranch, IAppointment, ENTITY_NAMES
│
└── infrastructure/                  # Concrete implementations
    ├── datasources/
    │   ├── generic/
    │   │   └── users.generic.datasource.ts  # Sobre el repositorio genérico
    │   └── sqlserver/
    │       └── users.sqlserver.datasource.ts # SQL Server via Sequelize
    ├── plugins/
    │   ├── dotenv.plugin.ts         # Environment variable loading
    │   ├── jwt.plugin.ts            # Token generation + middleware
    │   ├── pino.plugin.ts           # Structured logger (primary)
    │   ├── winston.plugin.ts        # Alternative logger
    │   ├── sequelize.plugin.ts      # SQL connection + query helpers
    │   ├── oracle.plugin.ts         # node-oracledb (thin mode) pool + transactions
    │   ├── nativeFileStorage.plugin.ts # Local filesystem storage
    │   └── s3FileStorage.plugin.ts  # AWS S3 / MinIO storage
    └── repositories/
        ├── base/                    # El repositorio genérico y su soporte
        │   ├── entity-metadata.ts        # Mapeo entidad ↔ tabla
        │   ├── oracle.where.compiler.ts  # Filtro declarativo → SQL con binds
        │   ├── memory.filter.ts          # El mismo filtro, evaluado en memoria
        │   ├── query-builder.ts          # IQueryable<T> encadenable (LINQ)
        │   ├── oracle.generic.repository.ts
        │   ├── memory.generic.repository.ts
        │   ├── module.repository.ts      # Base de los repositorios de módulo
        │   └── *.unit-of-work.ts         # Transacciones (Oracle / memoria)
        ├── entities.ts              # Mapeo de USERS, BRANCHES y APPOINTMENTS
        ├── seed-data.ts             # Datos de ejemplo del modo en memoria
        └── *.repository.ts          # Repositorios de módulo
```

The generic repository is documented in **[generic-repository.md](generic-repository.md)**; the Oracle setup in **[oracle.md](oracle.md)**.

---

## Request lifecycle

```
HTTP Request
    │
    ▼
Express Middleware (json, cors, pino-http)
    │
    ▼
Route handler  (users.route.ts)
    │  resolves controller from DI container
    ▼
Controller  (users.controller.ts)
    │  validates params, calls service
    ▼
Service  (appointments.service.ts)
    │  business rules, compound queries, Include of related aggregates,
    │  opens a transaction when the use case writes to more than one table
    ▼
Repository  (appointments.repository.ts)
    │  logs, wraps errors, delegates to the generic repository
    ▼
Generic repository  (Oracle or in-memory)
    │  builds the SQL from the entity mapping — all values as binds
    ▼
Returns up the chain → JSON response
```

Users still go through `IUsersDataSource`; on `dummy` and `oracle` that datasource is itself backed by the generic repository, so the CRUD is written once.

---

## Dependency Injection

tsyringe is the IoC container. All registrations live in `src/core/di/container.ts`.

```typescript
// Swap logger with a single line
container.registerSingleton<ILogger>("ILogger", WinstonPlugin);
// OR
container.register<ILogger>("ILogger", { useValue: new PinoLoggerPlugin({...}) });

// Swap datasource (Dummy → SQL Server)
container.register<IUsersDataSource>("IUsersDataSource", { useClass: UsersSqlServerDataSource });
```

Classes decorated with `@injectable()` and `@inject("Token")` are resolved automatically.

---

## Error handling

**Operational errors** (expected, e.g. "User not found") use the `AppError` class:

```typescript
throw new AppError("User not found", 404);
```

The global `errorHandler` middleware at the end of the middleware chain catches all errors and returns a consistent JSON response:

```json
{ "status": "error", "message": "User not found" }
```

Unexpected errors (5xx) are also caught and return a generic message without leaking stack traces.

---

## Adding a new module

See **[add-new-module.md](add-new-module.md)** for a complete step-by-step guide.

---

## Key interfaces

| Token | Interface | Purpose |
|-------|-----------|---------|
| `IEnvs` | `IEnvs` | Read environment variables |
| `ILogger` | `ILogger` | Structured logging |
| `ITokenPlugin` | `ITokenPlugin` | JWT sign / verify |
| `ISqlConnectionPlugin` | `ISqlConnectionPlugin` | Raw SQL execution |
| `IFileStorage` | `IFileStorage` | File upload |
| `IUsersDataSource` | `IUsersDataSource` | Data access |
| `IUsersRepository` | `IUsersRepository` | Data access abstraction |
| `IUsersService` | `IUsersService` | Business logic |
| `IUsersController` | `IUsersController` | HTTP handling |
