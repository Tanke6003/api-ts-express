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
│      (Repositories, DB connectors, Plugins)          │
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
│   │   ├── container.ts             # Composition root — decides the order only
│   │   ├── tokens.ts                # Injection tokens (TOKENS), checked at compile time
│   │   ├── logger.factory.ts        # LOG_DRIVER → ILogger
│   │   ├── repository.factory.ts    # DATA_SOURCE → stores + unit of work
│   │   └── modules/
│   │       ├── plugins.module.ts    # envs, logger, request context, jwt, storage
│   │       ├── persistence.module.ts # stores + unit of work
│   │       ├── system.module.ts     # identity + audit log
│   │       └── features/            # one file per business module — yours go here
│   └── errors/
│       └── app-error.ts             # AppError — operational error class
│
├── presentation/                    # HTTP layer — knows Express
│   ├── controllers/
│   │   └── users.controller.ts      # Handles req/res, delegates to service
│   ├── middlewares/
│   │   ├── httpLogger.middleware.ts  # Pino HTTP middleware
│   │   └── errorHandler.middleware.ts # Global error handler (last middleware)
│   ├── routes/
│   │   ├── index.route.ts           # Mounts all routers under /api
│   │   ├── users.route.ts           # OpenAPI-annotated CRUD routes
│   │   ├── branches.route.ts        # Sucursales
│   │   ├── appointments.route.ts    # Citas
│   │   └── test.route.ts            # Token generation & file upload (dev)
│   └── utils/
│       └── parse-id.ts              # Route param → positive integer, or 400
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
│   │   │   ├── plugins/             # ILogger, IEnvs, ITokenPlugin, IFileStorage,
│   │   │   │                        #   IRequestContext, IDbPlugin / ISqlDbPlugin
│   │   │   └── repositories/        # IGenericRepository, IUnitOfWork, IAuditTrail,
│   │   │                            #   per-module contracts
│   │   └── presentation/controllers/
│   └── models/                      # IUser, IBranch, IAppointment, IAuditLog, ENTITY_NAMES
│
└── infrastructure/                  # Concrete implementations
    ├── plugins/
    │   ├── dotenv.plugin.ts         # Environment variable loading
    │   ├── jwt.plugin.ts            # Token generation + middleware
    │   ├── asyncRequestContext.plugin.ts # AsyncLocalStorage — identity per request
    │   ├── pino.plugin.ts           # Structured logger (primary)
    │   ├── winston.plugin.ts        # Alternative logger
    │   ├── oracle.plugin.ts         # node-oracledb (thin mode) pool + transactions
    │   ├── sequelize-db.plugin.ts   # SQL Server, PostgreSQL and MySQL/MariaDB
    │   ├── mongo-db.plugin.ts       # MongoDB driver + sessions
    │   ├── nativeFileStorage.plugin.ts # Local filesystem storage
    │   └── s3FileStorage.plugin.ts  # AWS S3 / MinIO storage
    └── repositories/
        ├── base/                    # The generic repository and its support
        │   ├── entity-metadata.ts   # Entity ↔ table mapping
        │   ├── module.repository.ts # Base class for per-module repositories
        │   ├── audit-trail.ts       # Change log written by the repositories
        │   ├── dialects/            # Per-engine SQL differences (paging, identity...)
        │   ├── drivers/             # sql / mongo / memory implementations
        │   ├── query/               # Declarative filter → SQL, Mongo or in-memory,
        │   │                        #   plus the chainable IQueryable<T> (LINQ)
        │   └── unit-of-work/        # Transactions per engine
        ├── entities.ts              # Mapping for USERS, BRANCHES and APPOINTMENTS
        ├── seed-data.ts             # Example data for the in-memory driver
        └── *.repository.ts          # Per-module repositories
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
Generic repository  (SQL, MongoDB or in-memory)
    │  builds the query from the entity mapping — all values as binds
    ▼
Returns up the chain → JSON response
```

Every module goes through the same `IGenericRepository<T>`, whichever engine `DATA_SOURCE` selects, so the CRUD is written once. See **[connectors.md](connectors.md)**.

---

## Dependency Injection

tsyringe is the IoC container. `container.ts` is a composition root: it only decides the order, and each block registers itself from its own file under `di/modules/`.

```typescript
// container.ts, in full — the order matters only for the first two lines
const plugins = registerPlugins();          // envs → logger → request context → jwt → storage
const persistence = registerPersistence(plugins);

registerUsers();                            // repository + service + controller
registerBranches();
registerAppointments();
registerSystem();                           // identity + audit log
```

A module registers its three layers together, so adding one is a new file plus a line here, and removing one is deleting both:

```typescript
// modules/features/users.module.ts
export function registerUsers(): void {
  container.register<IUsersRepository>(TOKENS.IUsersRepository, { useClass: UsersRepository });
  container.register<IUsersService>(TOKENS.IUsersService, { useClass: UsersService });
  container.register<IUsersController>(TOKENS.IUsersController, { useClass: UsersController });
}
```

Tokens always come from `TOKENS` (`di/tokens.ts`) rather than a raw string: tsyringe resolves by string, so a typo in `@inject("IUsersServcie")` compiles and only fails when that class is constructed. Classes decorated with `@injectable()` and `@inject(TOKENS.X)` are resolved automatically.

Lifetimes: plugins are singletons — the request context *must* be one, since the middleware and the repository need the same AsyncLocalStorage. Repositories, services and controllers are transient; they hold no state between requests and the routers resolve them once at startup.

---

## Error handling

**Operational errors** (expected, e.g. "User not found") use the `AppError` class:

```typescript
throw new AppError("User not found", 404);
```

The global `errorHandler` middleware at the end of the middleware chain catches all errors and returns a consistent JSON response:

```json
{
  "status": "error",
  "code": "NOT_FOUND",
  "message": "User not found",
  "requestId": "3f2a...",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "path": "/api/users/9999",
  "method": "GET"
}
```

The same `requestId` goes out in the `X-Request-Id` header and into every log line of that request. Unexpected errors (5xx) are also caught and return a generic message without leaking stack traces. Full reference: **[errors-and-identity.md](errors-and-identity.md)**.

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
| `IFileStorage` | `IFileStorage` | File upload |
| `IRequestContext` | `IRequestContext` | Identity and request id, per request |
| `IUnitOfWork` | `IUnitOfWork` | Transaction spanning more than one table |
| `UsersStore` | `IGenericRepository<IUser>` | CRUD on the active engine |
| `IUsersRepository` | `IUsersRepository` | Data access abstraction |
| `IUsersService` | `IUsersService` | Business logic |
| `IUsersController` | `IUsersController` | HTTP handling |
