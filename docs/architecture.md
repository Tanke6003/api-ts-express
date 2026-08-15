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
│   ├── server.ts                    # Middleware order, routes, docs, error handling
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
│       ├── app-error.ts             # AppError — operational error class
│       └── error-mapper.ts          # Any thrown value → status + stable code
│
├── presentation/                    # HTTP layer — knows Express
│   ├── controllers/                 # Each one declares its own routes
│   │   ├── base.controller.ts       # Identity of the request, for every controller
│   │   ├── users.controller.ts      # @ApiController("/users") + @Get/@Post/...
│   │   ├── branches.controller.ts   # Sucursales
│   │   ├── appointments.controller.ts # Citas
│   │   ├── identity.controller.ts   # /me
│   │   ├── audit.controller.ts      # /audit — read-only change log
│   │   └── dev.controller.ts        # Token generation & file upload (dev only)
│   ├── middlewares/
│   │   ├── requestContext.middleware.ts # Opens the per-request store, mints requestId
│   │   ├── httpLogger.middleware.ts  # Pino HTTP middleware
│   │   ├── validate.middleware.ts    # Zod body/query guards
│   │   └── errorHandler.middleware.ts # Global error handler (last middleware)
│   ├── routing/                     # How a controller becomes HTTP + docs
│   │   ├── route.decorators.ts      # @ApiController, @Get/@Post/... and the registry
│   │   ├── router.builder.ts        # Metadata → Express: guard, validation, handler
│   │   ├── openapi.builder.ts       # The same metadata → the OpenAPI paths
│   │   └── index.route.ts           # Walks the registry and mounts under API_PREFIX
│   └── utils/
│       └── parse-id.ts              # Route param → positive integer, or 400
│
├── application/                     # Business logic — knows Domain only
│   ├── dtos/                        # Zod schemas: TS type + OpenAPI component
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
    │   ├── jwt.plugin.ts            # Token generation + guard, publishes the identity
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

The generic repository, the entity mapping and the engine drivers are documented in **[data-access.md](data-access.md)**.

---

## Request lifecycle

```
HTTP Request
    │
    ▼
Express Middleware
    │  request context → helmet → rate limit → cors → json → pino-http
    │
    ▼
Router built from the decorators  (router.builder.ts)
    │  JWT guard, then Zod validation of body/query
    ▼
Controller  (users.controller.ts)
    │  declares its own routes; handles req/res and calls the service
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

Every module goes through the same `IGenericRepository<T>`, whichever engine `DATA_SOURCE` selects, so the CRUD is written once. See **[data-access.md](data-access.md)**.

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

Every failure, from any layer, leaves through the same door. Nothing invents its own error format: `validateBody`, `validateQuery` and the JWT guard all call `next(error)` and let the global handler render it, so a client parses one shape instead of five.

### The envelope

```json
{
  "status": "error",
  "code": "APPOINTMENT_OVERLAP",
  "message": "La sucursal ya tiene la cita #5 en ese horario",
  "requestId": "407215bc-e453-4dcf-ac2f-37a1e88109c2",
  "timestamp": "2026-08-09T03:09:29.264Z",
  "path": "/api/appointments",
  "method": "POST",
  "errors": [{ "field": "name", "message": "El nombre es obligatorio" }],
  "stack": ["..."],
  "causes": ["Error: ORA-00001: unique constraint violated"]
}
```

- `code` is stable and meant to be branched on by the client; `message` is for humans and may be rewritten.
- `errors` appears only for field-level validation.
- `stack` and `causes` appear **only outside production**: they are the most useful thing for debugging and the most dangerous to publish.
- A 5xx flagged non-operational always answers `"Internal server error"` regardless of environment — hiding the message is not a production-only courtesy, it is the rule for failures the code did not anticipate. An operational error keeps its message even at 500, because someone chose to write it for the client.
- `requestId` goes out in the `X-Request-Id` header and into every log line of that request, so a user's screenshot is enough to find the trace.

### Stable codes

`normalizeError` (`src/core/errors/error-mapper.ts`) turns any thrown value into a status and a code. Order matters — most specific first:

| Source | Result |
|--------|--------|
| `AppError` | its own `statusCode`, `code`, `errors` |
| `ZodError` | 400 `VALIDATION_ERROR` + per-field detail |
| `TokenExpiredError` | 401 `TOKEN_EXPIRED` |
| `JsonWebTokenError` / `NotBeforeError` | 401 `INVALID_TOKEN` |
| body-parser `entity.parse.failed` | 400 `MALFORMED_JSON` |
| body-parser `entity.too.large` | 413 `PAYLOAD_TOO_LARGE` |
| Oracle `ORA-…` anywhere in the cause chain | see below |
| anything else | 500 `INTERNAL_ERROR`, flagged non-operational |

An `AppError` thrown without an explicit `code` still gets one, derived from its status — `400 BAD_REQUEST`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 CONFLICT`, `413 PAYLOAD_TOO_LARGE`, `422 UNPROCESSABLE_ENTITY`, `429 TOO_MANY_REQUESTS`, `503 SERVICE_UNAVAILABLE`, and `INTERNAL_ERROR` / `REQUEST_ERROR` for the rest. The client therefore never has to fall back to reading the status alone.

### Throwing your own

```typescript
throw new AppError("La sucursal ya tiene una cita en ese horario", 409, true, {
  code: "APPOINTMENT_OVERLAP",
});
```

The third argument is `isOperational`. `true` means an expected outcome: it is logged as a warning and its message reaches the client. `false` marks a bug, which is logged as an error and answered with the generic message.

### Driver errors

The repositories wrap what the driver throws so that SQL detail never leaks upwards, but they preserve the original in `cause`:

```
UsersRepository.insert failed.            ← BaseModuleRepository.guard
  └─ [OraclePlugin] execute failed        ← OraclePlugin
       └─ ORA-00001: unique constraint…   ← node-oracledb
```

`normalizeError` walks that chain, so a duplicate key answers **409** instead of a blank 500 while the client still never sees the constraint name:

| Code | HTTP | `code` |
|------|------|--------|
| `ORA-00001` | 409 | `DB_UNIQUE_VIOLATION` |
| `ORA-01400` | 400 | `DB_NOT_NULL_VIOLATION` |
| `ORA-02290` | 400 | `DB_CHECK_VIOLATION` |
| `ORA-02291` | 400 | `DB_REFERENCE_NOT_FOUND` |
| `ORA-02292` | 409 | `DB_REFERENCE_IN_USE` |
| `ORA-12899` | 400 | `DB_VALUE_TOO_LARGE` |
| `ORA-01033/03113/03114/12154/12170/12514/12541` | 503 | `DB_UNAVAILABLE` |
| any other `ORA-` | 500 | `DB_ERROR`, non-operational |

Only Oracle codes are recognised today. Failures from the other engines fall through to the generic 500, which is safe but coarse; adding a mapper for them is a matter of extending `error-mapper.ts` with the same shape.

### Logging

The handler logs once per failure, with everything needed to reconstruct it:

```
requestId, method, path, statusCode, code, userId, userName, error, causes, stack
```

5xx and non-operational errors go to `logger.error`; everything else to `logger.warn` — a rejected request is normal traffic, not an alarm. The logger and the request context are resolved defensively, so the handler still answers when the container is not mounted, as happens in tests that build middlewares by hand.

### Middleware order

Order is not cosmetic here:

```typescript
requestContext(context)   // first of all, even before body parsing
express.json() / express.urlencoded()
cors()
logger.http()
express.static("public")
…routes…
scalar / swagger
notFoundHandler           // 404 with the same envelope, code ROUTE_NOT_FOUND
errorHandler              // always last
```

- `requestContext` goes **before** `express.json()` so that even a malformed body is rejected with a `requestId`.
- `notFoundHandler` and `errorHandler` go **after** Swagger and Scalar. An Express error handler only covers routes registered before it, and a 404 handler placed too early would swallow the documentation.

Both are registered by `Server.configureErrorHandling()`, which `run()` calls last. A test that assembles the app by hand must call it too, or errors escape as Express's default HTML. See **[testing.md](testing.md)**.

---

## Identity and audit

Knowing *who* is calling is a cross-cutting concern: the controller wants it for authorisation, the repository wants it for the audit columns, and the error handler wants it for the log. Passing a user parameter down four layers would pollute every signature, so the identity travels out of band.

### The request context

`AsyncRequestContextPlugin` is the Node counterpart of `IHttpContextAccessor` in .NET. It stores the request data in an `AsyncLocalStorage`, so the store survives every `await` and stays isolated between concurrent requests — a plain module variable would leak one user's identity into another's request.

```typescript
context.getCurrentUser();      // { id, name, email } | null
context.getCurrentUserId();    // for business rules
context.getCurrentUserName();  // "System" when there is no request
context.getRequestId();
```

`requestContext` opens the store before anything else and mints a UUID for the request — unless the caller already sent an `x-request-id` header, which is respected so one operation can be followed across several services. The same value is set on the response.

The identity is filled in later, by the JWT guard: it is the only place where a token is verified, so it is the only place that needs to publish who the caller is. It mutates the store already in flight rather than opening a new one, which is what keeps the `requestId` minted upstream.

Claims are read by trying a list of names in order, because providers disagree on them:

| | Claims tried, in order |
|---|---|
| id | `sub`, `userId`, `id`, `oid` |
| name | `name`, `nameComplete`, `preferred_username`, `samaccountname`, `username` |
| email | `email`, `emails`, `upn` |

If no name claim is present the email is used, and failing that the id — so an authenticated write is never recorded as `System`.

### Controllers

`BaseController` publishes the same claims to every controller, so none of them parses a token or reads `req.user`:

```typescript
this.currentUser;      // CurrentUser | null
this.userId;           // string | null
this.userName;         // "System" outside a request
this.userEmail;
this.requestId;
this.requireUserId();  // same id, but 401 NO_AUTHENTICATED_USER instead of null
```

Use the **id**, never the name, for anything that depends on who is asking — names change, ids don't:

```typescript
const userId = this.requireUserId();
if (appointment.fkClient !== Number(userId)) {
  throw new AppError("No puedes modificar una cita de otro cliente", 403);
}
```

`GET /api/generate-token?userId=7&name=Ruben&email=ruben@example.com` issues a development token carrying `sub`, `userId`, `name` and `email`. `GET /api/me` returns what the API resolved from it — the same identity that ends up in the audit columns:

```json
{ "id": "7", "name": "Ruben", "email": "ruben@example.com", "requestId": "7452d8c1-…" }
```

### Audit columns

An entity that declares `audit` in its mapping gets the writer's name persisted automatically:

```typescript
audit: { createdBy: "createdBy", updatedBy: "updatedBy" }
```

- `insert` and `insertMany` fill `CREATED_BY`.
- `update`, `updateWhere`, `softDelete` and `restore` fill `UPDATED_BY` — a logical delete is a modification and should say who did it.
- Outside a request (seeds, startup, scheduled work) the value is `System`.

The value always comes from the context, **never from the request body**: all three drivers — SQL, MongoDB and in-memory — skip these properties when mapping the payload, so a client cannot claim to be someone else. Only the name is stored, matching the usual `CreatedByUser` convention; if you also need the id on the row, add a column, map it, and extend `AuditMetadata` — the repositories already have the id available through the context.

The demo schemas of every engine carry `CREATED_BY … DEFAULT 'System' NOT NULL` and a nullable `UPDATED_BY`.

### The audit trail

Those columns only keep the *last* writer. The `AUDIT_LOG` table keeps the whole history, including rows that were later deleted for good. An entity opts in with one flag:

```typescript
auditTrail: true,
```

From then on every write leaves a line, with no service having to remember anything:

| Action | Recorded detail |
|--------|-----------------|
| `INSERT` | `{ after }` — the row as persisted |
| `UPDATE` | `{ before, after }` |
| `SOFT_DELETE` / `RESTORE` | the action alone |
| `HARD_DELETE` | `{ before }` — the row's last state, the reason the trail exists |
| `INSERT_MANY` / `HARD_DELETE_MANY` | `{ affected }` |
| `UPDATE_MANY` | `{ changes, affected }` |

Bulk operations are deliberately summarised rather than expanded row by row: a line per affected record would cost more than the operation being audited. Reads never produce a line, and neither does a single-row write that matched nothing. The detail is stored as JSON text — not a native JSON column, so the trail does not depend on each engine's support — and truncated at 4000 characters to match the column width.

Two design points are worth knowing, because both were bugs before they were decisions:

**The identity is captured when the operation starts, not when the line is written.** By record time several database round-trips have happened, and a connection pool may resolve its callbacks in the context where the *pool* was created rather than the request's. Reading the user at that point silently attributes everything to `System`. `captureActor()` takes the snapshot before the first `await`.

**The line goes through the same scope as the audited operation** — the transaction's executor in SQL, the session in MongoDB. It therefore lands in the same commit and disappears with a rollback, and a failure to record fails the operation: a trail that silently drops entries is not a trail.

`AUDIT_LOG` itself does not set `auditTrail` — auditing the audit would recurse — and it has neither soft delete nor audit columns, because an audit line is not something you delete and its author is already in `CHANGED_BY`.

Reading it back:

```bash
GET /api/audit?entity=BRANCHES&entityId=4
GET /api/audit?requestId=407215bc-…    # everything one request did
```

The endpoint filters by entity, id, action, author and request id, returns newest first, and is read-only: there is no way to write a line through the API.

---

## Adding a new module

See **[add-new-module.md](add-new-module.md)** for a complete step-by-step guide.

---

## Key interfaces

| Token | Interface | Purpose |
|-------|-----------|---------|
| `IEnvs` | `IEnvs` | Read environment variables |
| `ILogger` | `ILogger` | Structured logging |
| `ITokenPlugin` | `ITokenPlugin` | JWT sign / verify, and the route guard |
| `IFileStorage` | `IFileStorage` | File upload |
| `IRequestContext` | `IRequestContext` | Identity and request id, per request |
| `IAuditTrail` | `IAuditTrail` | Change log line, bound to the active transaction |
| `IUnitOfWork` | `IUnitOfWork` | Transaction spanning more than one table |
| `UsersStore` | `IGenericRepository<IUser>` | CRUD on the active engine |
| `IUsersRepository` | `IUsersRepository` | Data access abstraction |
| `IUsersService` | `IUsersService` | Business logic |
| `IUsersController` | `IUsersController` | HTTP handling |
