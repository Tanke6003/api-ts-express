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
│       └── test.route.ts            # Token generation & file upload (dev)
│
├── application/                     # Business logic — knows Domain only
│   ├── dtos/
│   │   └── users.dtos.ts            # Request/response shapes (OpenAPI schemas)
│   └── services/
│       └── users.service.ts         # Orchestrates domain operations via repository
│
├── domain/                          # Core — zero external dependencies
│   ├── interfaces/
│   │   ├── application/services/    # IUsersService
│   │   ├── infrastructure/
│   │   │   ├── datasources/         # IUsersDataSource
│   │   │   ├── plugins/             # ILogger, IEnvs, ITokenPlugin, IFileStorage, ISqlConnectionPlugin
│   │   │   └── repositories/        # IUsersRepository
│   │   └── presentation/controllers/ # IUsersController
│   └── models/
│       └── users.model.ts           # IUser domain entity
│
└── infrastructure/                  # Concrete implementations
    ├── datasources/
    │   ├── dummy/
    │   │   └── users.dummy.datasource.ts  # In-memory with soft delete
    │   └── sqlserver/
    │       └── users.sqlserver.datasource.ts # SQL Server via Sequelize
    ├── plugins/
    │   ├── dotenv.plugin.ts         # Environment variable loading
    │   ├── jwt.plugin.ts            # Token generation + middleware
    │   ├── pino.plugin.ts           # Structured logger (primary)
    │   ├── winston.plugin.ts        # Alternative logger
    │   ├── sequelize.plugin.ts      # SQL connection + query helpers
    │   ├── nativeFileStorage.plugin.ts # Local filesystem storage
    │   └── s3FileStorage.plugin.ts  # AWS S3 / MinIO storage
    └── repositories/
        └── users.repository.ts      # Logs + delegates to datasource
```

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
Service  (users.service.ts)
    │  maps DTO ↔ domain model, calls repository
    ▼
Repository  (users.repository.ts)
    │  logs, wraps errors, calls datasource
    ▼
DataSource  (dummy or SQL Server)
    │  executes query / in-memory operation
    ▼
Returns up the chain → JSON response
```

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
