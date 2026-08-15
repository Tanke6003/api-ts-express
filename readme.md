# API Template — Node.js · Express 5 · TypeScript

A production-ready REST API starter built with **Node.js**, **Express 5**, and **TypeScript**, following **Clean Architecture** principles. Swap the data source (`DATA_SOURCE`) or the logger (`LOG_DRIVER`) with a single environment variable — every layer is independently testable.

---

## Features

| Category | Implementation |
|----------|---------------|
| Framework | Express 5 |
| Language | TypeScript 5 (strict mode) |
| Architecture | Clean Architecture (Presentation → Application → Domain → Infrastructure) |
| Routing | Declared on the controller: one decorator gives the route, the validation and the OpenAPI operation |
| Dependency Injection | tsyringe |
| Authentication | JWT (Bearer token), with the identity exposed per request via AsyncLocalStorage |
| HTTP hardening | Helmet, per-IP rate limiting, CORS allowlist, 1 MB body cap, docs off in production |
| Error handling | Single global handler: stable codes, request id, driver-error mapping |
| Database | Oracle, SQL Server, PostgreSQL, MySQL/MariaDB, MongoDB or in-memory — selected via `DATA_SOURCE`, all on the same generic repository |
| Data access | Generic repository with EF/LINQ-style CRUD, chainable queries, soft & hard delete, and a Unit of Work |
| Transactions | `@Transactional()` on the service; the injected repositories join the open one on their own |
| Logging | Pino (structured JSON, pino-pretty in dev) or Winston — selected via `LOG_DRIVER` |
| API Docs | Swagger UI + Scalar, generated from the route decorators and the Zod schemas — no hand-written annotations |
| File Storage | Local filesystem or AWS S3 / MinIO |
| Web UI | Static HTML + vanilla JS + Tailwind, served from `public/` |
| Testing | Jest — unit, integration |
| Linting | ESLint 9 (flat config) |
| CI | GitHub Actions |

---

## Quick start

```bash
git clone <repo-url>
cd api-ts-express
npm install
cp .env.template .env.dev
npm run dev:win        # Windows
# or
npm run dev           # Linux / macOS
```

The server starts on port **3001** by default.

| URL | Description |
|-----|-------------|
| `/` | Web UI — appointments, branches and users |
| `GET /health/live` | Liveness — the process answers. Never touches the database |
| `GET /health/ready` | Readiness — 503 if the database is down or the app is draining |
| `GET /health` | Alias of `/health/ready` |
| `GET /api/v1/users` | List users (`/api/...` still works as an alias) |
| `GET /api/v1/branches` | List branches |
| `GET /api/v1/appointments` | List appointments |
| `GET /api/swagger` | Swagger UI |
| `GET /api/scalar` | Scalar API reference |
| `GET /api/v1/me` | Identity resolved from the token |
| `GET /api/v1/audit` | Change log (read-only) |
| `GET /api/v1/generate-token` | Generate a test JWT (`?userId=7&name=Ruben`) |

Out of the box `DATA_SOURCE=dummy`, so everything above works with no database. To run against Oracle:

```bash
docker compose up -d oracle       # Oracle 23ai Free, schema + seed applied on first boot
# then set DATA_SOURCE=oracle in .env.dev and restart
```

For a detailed walkthrough see **[docs/getting-started.md](docs/getting-started.md)**.

---

## Project structure

```
src/
├── main.ts                     # Entry point
├── core/
│   ├── config/                 # OpenAPI, security, API prefix, env validation
│   ├── di/                     # Composition root, tokens, one module per feature
│   └── errors/                 # AppError + driver-error mapping
├── presentation/               # HTTP layer
│   ├── controllers/            # Each one declares its own routes with decorators
│   ├── middlewares/            # httpLogger, errorHandler, JWT guard, request context
│   ├── routing/                # Decorators, router builder, OpenAPI builder, mounting
│   └── utils/                  # parse-id and other HTTP helpers
├── application/                # Business logic
│   ├── dtos/                   # Zod schemas: TS type + OpenAPI component
│   ├── queries/                # loadRelated — EF-style Include, batched
│   ├── services/               # Business rules & compound queries
│   └── validators/             # Zod schemas
├── domain/                     # Core contracts (no dependencies)
│   ├── interfaces/
│   └── models/
├── infrastructure/             # Concrete implementations
│   ├── plugins/                # Pino, Winston, JWT, Oracle, Sequelize, Mongo, S3
│   └── repositories/
│       ├── base/               # Generic repository, query builder, unit of work
│       └── entities.ts         # Entity ↔ table mapping (the only place columns are named)
└── ...

public/                         # Web UI (HTML + JS + Tailwind)
docker/<engine>/                # Schema and seed for each engine
```

Full architecture reference: **[docs/architecture.md](docs/architecture.md)**.

---

## Data access

Describe a table once and get the classic CRUD with no SQL:

```typescript
const page = await appointmentsRepository
  .query()
  .where({ fkBranch: 1, status: { notIn: ["CANCELLED"] } })
  .orderByDescending("scheduledAt")
  .toPagedList(1, 20);

await branchesRepository.softDelete(3);   // borrado lógico
await branchesRepository.hardDelete(3);   // borrado físico
```

The same interface runs on Oracle or in memory depending on `DATA_SOURCE`. Relations are composed in the service layer (EF-style `Include`), and transactions are opened only where a use case writes to more than one table.

Every write records who made it (`CREATED_BY` / `UPDATED_BY`), taken from the token — never from the request body — and entities that opt in also leave a full history in `AUDIT_LOG`, queryable at `GET /api/v1/audit`.

Full reference: **[docs/data-access.md](docs/data-access.md)** — the repository, the filter language, the six engines and how to set each one up. Errors, identity and the audit trail: **[docs/architecture.md](docs/architecture.md)**.

---

## Using this as a template

Everything under `core/`, `infrastructure/` and the cross-cutting middlewares is the scaffolding: connectors, generic repository, unit of work, audit trail, error handling, request identity. It knows nothing about the example domain.

**Branches and appointments are only an example.** They exist to show the patterns end to end — compound queries, `Include`, a transaction that spans two tables, a business rule with a real conflict. To strip them:

1. Delete `branches.*` and `appointments.*` across `domain/`, `application/`, `infrastructure/repositories/` and `presentation/`, plus their tests.
2. Delete their module file under `core/di/modules/features/` and its line in `container.ts`, then remove their entries from `entities.ts`, `seed-data.ts`, `ENTITY_NAMES`, `tokens.ts`, `repository.factory.ts`, `persistence.module.ts` and `index.route.ts`.
3. Drop their tables from `docker/<engine>/` and their tabs from `public/`.

Users is a smaller example of the same shape and can go the same way. What remains is the template. Then follow **[docs/add-new-module.md](docs/add-new-module.md)** for your own modules.

---

## Available scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Development server with hot reload (Linux/macOS) |
| `npm run dev:win` | Development server with hot reload (Windows) |
| `npm run dev:win:pretty` | Development with pino-pretty formatting |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled build (production) |
| `npm test` | Run all tests with coverage |
| `npm run test:watch` | Tests in watch mode |
| `npm run test:local` | Tests with full HTML + LCOV reports |
| `npm run test:repo` | Tests for CI (text-summary coverage only) |
| `npm run typecheck` | `tsc --noEmit` — types only, no build |
| `npm run lint` | ESLint over `src`, `tests` and `public` — checks, does not write |
| `npm run lint:fix` | The same, applying the fixes it can |
| `npm run check` | Typecheck + lint + tests. What CI runs, in one command |

Code style is pinned in two places on purpose. `.editorconfig` covers what the editor decides when saving — encoding, indentation, line endings, final newline — and `eslint.config.mjs` covers what can be checked after the fact. On `src` the linter runs with type information, so it also catches promises nobody awaits, which is the class of bug that answers 200 while the write fails in the background.

---

## Environment variables

Copy `.env.template` to `.env.dev` (development) or `.env` (production) and fill in the values.

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | HTTP port |
| `NODE_ENV` | `development` | `development` / `production` / `test` |
| `SERVICE_NAME` | `ApiTSExpress` | Service name in logs |
| `API_VERSION` | `1.0.0` | Shown in Swagger |
| `JWT_SECRET` | — | **Required.** Sign JWT tokens. No insecure default — the app fails fast at startup if missing |
| `API_PREFIX` | `/api/v1` | Where the API is mounted. Moves the surface (e.g. behind a proxy); it does not create a new version |
| `API_LEGACY_PREFIX` | `/api` | Unversioned alias for existing clients. `off` removes it |
| `CORS_ORIGINS` | — | Allowed origins, comma separated. As many as you need. Empty = same origin only; `*` allows any |
| `BODY_LIMIT` | `1mb` | Max JSON / urlencoded body. Uploads stream through busboy and never reach these parsers |
| `TRUST_PROXY_HOPS` | `0` | Trusted proxy hops in front of the app. `1` behind one nginx / load balancer |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX` | `60000` / `120` | Global rate limit per IP. `RATE_LIMIT_MAX=0` disables it. `/health*` is exempt |
| `AUTH_RATE_LIMIT_WINDOW_MS` / `AUTH_RATE_LIMIT_MAX` | `900000` / `10` | Rate limit for the routes that hand out credentials |
| `CSP_ENABLED` | `false` | Content-Security-Policy. Off by default: it breaks the demo UI, Swagger and Scalar |
| `DOCS_ENABLED` | — | Publish Swagger / Scalar / `openapi.json`. Default: everywhere except production |
| `SHUTDOWN_DELAY_MS` | `0` | Gap between reporting "not ready" and closing the socket. Behind Kubernetes, `5000` |
| `SHUTDOWN_TIMEOUT_MS` | `10000` | Whole-shutdown budget. Keep it below the orchestrator's grace period |
| `DATA_SOURCE` | `dummy` | `dummy` (in-memory) / `oracle` / `sqlserver` / `postgres` / `mysql` / `mongodb`. An unknown value fails at startup instead of falling back to memory |
| `LOG_DRIVER` | `pino` | Logger implementation: `pino` / `winston` |
| `LOG_LEVEL` | `trace` | `trace` / `debug` / `info` / `warn` / `error` / `fatal` |
| `DB_*` | — | SQL Server: host, port, user, password, database |
| `ORACLE_*` | — | Oracle: user, password, connect string, pool sizes |
| `POSTGRES_*` | — | PostgreSQL: host, port, user, password, database |
| `MYSQL_*` | — | MySQL / MariaDB: host, port, user, password, database |
| `MONGO_*` | — | MongoDB: host, port, database, and optional credentials |

Only the block for the active `DATA_SOURCE` is required, and its password is checked before the server boots: the app refuses to start with a missing secret rather than failing on the first request.

Full reference: **[docs/getting-started.md](docs/getting-started.md)**.

---

## API documentation

When the server is running, open:

- **Swagger UI** — `http://localhost:3001/api/swagger`
- **Scalar** — `http://localhost:3001/api/scalar`
- **OpenAPI JSON** — `http://localhost:3001/api/openapi.json`

Authentication is done with a **Bearer JWT**. Click **Authorize** in Swagger, then use the token from `GET /api/v1/generate-token`.

The document is generated: the paths come from the route decorators and every
schema from Zod, so there is not a line of hand-written OpenAPI in the project
and the docs cannot drift from what the code validates. It is OpenAPI 3.1,
because its schema *is* JSON Schema 2020-12 — exactly what Zod emits. See
**[docs/decorated-routes.md](docs/decorated-routes.md)**.

---

## Authentication (JWT)

Protected routes require an `Authorization: Bearer <token>` header.

```bash
# 1. Get a token
curl http://localhost:3001/api/v1/generate-token

# 2. Use it in protected endpoints
curl -X POST http://localhost:3001/api/v1/users \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "Alice"}'
```

---

## Docker (optional local services)

Every engine has a service, with its schema and seed applied on first boot. Start only the one you need:

```bash
docker compose up -d postgres      # or oracle, mysql, mongo
docker compose up -d mssql-init    # SQL Server: the companion applies its schema
```

| Service | Host port | Credentials |
|---------|-----------|-------------|
| Oracle 23ai Free | `1521` | `appuser / AppPassword1`, service `FREEPDB1` |
| SQL Server 2022 | `1434` | `sa / StrongPassword123!` |
| PostgreSQL 16 | `5433` | `appuser / AppPassword1` |
| MySQL 8 | `3307` | `appuser / AppPassword1` |
| MongoDB 7 | `27017` | no auth, replica set `rs0` |
| MinIO API / Console | `9100` / `9101` | `minioadmin / minioadmin`, bucket `my-bucket` created by `minio-init` |

PostgreSQL, MySQL and SQL Server are published off their standard ports because a local install usually owns 5432, 3306 and 1433 — and when it does, the API connects to the wrong server and the failure looks like bad credentials. Override with `POSTGRES_PORT`, `MYSQL_PORT` or `DB_PORT`.

MongoDB runs as a single-node replica set: transactions need one, so without it the unit of work cannot open a session.

Full deployment guide: **[docs/getting-started.md](docs/getting-started.md)**.

---

## Testing

```bash
npm test                  # unit + integration, with coverage
npm run test:watch        # watch mode
npm run test:local        # verbose + HTML report at reports/
```

Coverage thresholds are enforced per layer:

| Layer | Branches | Functions / Lines |
|-------|----------|-------------------|
| Application | 85 % | 90 % |
| Infrastructure | 70 % | 90 % |
| Presentation | 80 % | 90 % |

Full guide: **[docs/testing.md](docs/testing.md)**.

---

## Adding a new resource

Follow the step-by-step guide: **[docs/add-new-module.md](docs/add-new-module.md)**. Most of a new module is now declarative — describe the table and the generic repository provides the CRUD, decorate the controller and the routes, the validation and the documentation come with it.

How the decorators work, and how to declare a DTO once: **[docs/decorated-routes.md](docs/decorated-routes.md)**.

---

## Design patterns

| Pattern | Location |
|---------|---------|
| Repository | `infrastructure/repositories/` |
| Generic Repository | `infrastructure/repositories/base/` — one CRUD for every entity |
| Unit of Work | `infrastructure/repositories/base/*.unit-of-work.ts` |
| Declarative transaction | `application/transactions/` — `@Transactional()` + `lockRow` on the service |
| Query Object | `base/query-builder.ts` — LINQ-style `IQueryable<T>` |
| Data Mapper | `repositories/entities.ts` — entity ↔ table mapping |
| Dependency Injection | `core/di/` (tsyringe) — composition root, tokens, one file per module |
| Service Layer | `application/services/` |
| DTO | `application/dtos/` |
| Strategy | Pluggable engine drivers (memory ↔ SQL ↔ MongoDB), one contract |
| Singleton | Logger instances |
| Global error handler | `presentation/middlewares/errorHandler.middleware.ts` |
| Ambient context (IHttpContextAccessor) | `asyncRequestContext.plugin.ts` (identity) and `asyncTransactionContext.plugin.ts` (open transaction) |
| Declarative routing | `presentation/routing/` — `@ApiController` / `@Get`… drive routing, validation and docs |

---

## Contributing

See **[.github/CONTRIBUTING.md](.github/CONTRIBUTING.md)** for branch naming, commit conventions, and PR process.

---

## License

ISC
