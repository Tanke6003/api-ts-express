# API Template — Node.js · Express 5 · TypeScript

A production-ready REST API starter built with **Node.js**, **Express 5**, and **TypeScript**, following **Clean Architecture** principles. Swap the data source (`DATA_SOURCE`) or the logger (`LOG_DRIVER`) with a single environment variable — every layer is independently testable.

---

## Features

| Category | Implementation |
|----------|---------------|
| Framework | Express 5 |
| Language | TypeScript 5 (strict mode) |
| Architecture | Clean Architecture (Presentation → Application → Domain → Infrastructure) |
| Dependency Injection | tsyringe |
| Authentication | JWT (Bearer token), with the identity exposed per request via AsyncLocalStorage |
| Error handling | Single global handler: stable codes, request id, driver-error mapping |
| Database | Oracle 23ai (node-oracledb, thin mode), SQL Server 2022 (Sequelize + tedious) or in-memory — selected via `DATA_SOURCE`, all three on the same generic repository |
| Data access | Generic repository with EF/LINQ-style CRUD, chainable queries, soft & hard delete, and a Unit of Work |
| Logging | Pino (structured JSON, pino-pretty in dev) or Winston — selected via `LOG_DRIVER` |
| API Docs | Swagger UI + Scalar |
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
| `GET /health` | Health check (reports the active `dataSource`) |
| `GET /api/users` | List users |
| `GET /api/branches` | List branches |
| `GET /api/appointments` | List appointments |
| `GET /api/swagger` | Swagger UI |
| `GET /api/scalar` | Scalar API reference |
| `GET /api/me` | Identity resolved from the token |
| `GET /api/audit` | Change log (read-only) |
| `GET /api/generate-token` | Generate a test JWT (`?userId=7&name=Ruben`) |

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
│   ├── config/                 # Swagger configuration
│   ├── di/                     # tsyringe DI container
│   └── errors/                 # AppError custom error class
├── presentation/               # HTTP layer
│   ├── controllers/
│   ├── middlewares/            # httpLogger, errorHandler, JWT guard
│   └── routes/                 # OpenAPI-annotated route definitions
├── application/                # Business logic
│   ├── dtos/                   # Data Transfer Objects
│   ├── queries/                # loadRelated — EF-style Include, batched
│   ├── services/               # Business rules & compound queries
│   └── validators/             # Zod schemas
├── domain/                     # Core contracts (no dependencies)
│   ├── interfaces/
│   └── models/
├── infrastructure/             # Concrete implementations
│   ├── datasources/            # Generic (memory/Oracle) & SQL Server
│   ├── plugins/                # Pino, Winston, JWT, Sequelize, Oracle, S3
│   └── repositories/
│       ├── base/               # Generic repository, query builder, unit of work
│       └── entities.ts         # Entity ↔ table mapping (the only place columns are named)
└── ...

public/                         # Web UI (HTML + JS + Tailwind)
docker/oracle/                  # Oracle init script, schema and seed
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

Every write records who made it (`CREATED_BY` / `UPDATED_BY`), taken from the token — never from the request body — and entities that opt in also leave a full history in `AUDIT_LOG`, queryable at `GET /api/audit`.

Full reference: **[docs/generic-repository.md](docs/generic-repository.md)** · Oracle setup: **[docs/oracle.md](docs/oracle.md)** · Errors and identity: **[docs/errors-and-identity.md](docs/errors-and-identity.md)**.

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
| `npm run lint` | ESLint with auto-fix |

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
| `DATA_SOURCE` | `dummy` | Data source: `dummy` (in-memory) / `oracle` / `sqlserver` |
| `LOG_DRIVER` | `pino` | Logger implementation: `pino` / `winston` |
| `LOG_LEVEL` | `trace` | Log level |
| `DB_DIALECT` | `mssql` | `mssql` / `mysql` / `postgres` |
| `DB_HOST` | `localhost` | Database host |
| `DB_PORT` | `1434` | Database port |
| `DB_USER` | `sa` | Database user |
| `DB_PASSWORD` | — | Database password. Required (fails fast) when `DATA_SOURCE=sqlserver` |
| `DB_NAME` | `testdb` | Database name |
| `ORACLE_USER` | `appuser` | Oracle schema owner |
| `ORACLE_PASSWORD` | — | Oracle password. Required (fails fast) when `DATA_SOURCE=oracle` |
| `ORACLE_CONNECT_STRING` | `localhost:1521/FREEPDB1` | Easy Connect: `host:port/service` |

Full reference: **[docs/environment.md](docs/environment.md)**.

---

## API documentation

When the server is running, open:

- **Swagger UI** — `http://localhost:3001/api/swagger`
- **Scalar** — `http://localhost:3001/api/scalar`
- **OpenAPI JSON** — `http://localhost:3001/api/openapi.json`

Authentication is done with a **Bearer JWT**. Click **Authorize** in Swagger, then use the token from `GET /api/generate-token`.

---

## Authentication (JWT)

Protected routes require an `Authorization: Bearer <token>` header.

```bash
# 1. Get a token
curl http://localhost:3001/api/generate-token

# 2. Use it in protected endpoints
curl -X POST http://localhost:3001/api/users \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "Alice"}'
```

---

## Docker (optional local services)

Start SQL Server and MinIO (S3-compatible) locally:

```bash
docker compose up -d
```

| Service | Port | Credentials |
|---------|------|-------------|
| SQL Server 2022 | `1434` | `sa / StrongPassword123!` |
| MinIO API | `9100` | `minioadmin / minioadmin` |
| MinIO Console | `9101` | `minioadmin / minioadmin` |

Full deployment guide: **[docs/deployment.md](docs/deployment.md)**.

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

Follow the step-by-step guide: **[docs/add-new-module.md](docs/add-new-module.md)**. Most of a new module is now declarative — describe the table and the generic repository provides the CRUD.

---

## Design patterns

| Pattern | Location |
|---------|---------|
| Repository | `infrastructure/repositories/` |
| Generic Repository | `infrastructure/repositories/base/` — one CRUD for every entity |
| Unit of Work | `infrastructure/repositories/base/*.unit-of-work.ts` |
| Query Object | `base/query-builder.ts` — LINQ-style `IQueryable<T>` |
| Data Mapper | `repositories/entities.ts` — entity ↔ table mapping |
| Dependency Injection | `core/di/container.ts` (tsyringe) |
| Service Layer | `application/services/` |
| DTO | `application/dtos/` |
| Strategy | Pluggable datasources & drivers (memory ↔ Oracle ↔ SQL Server) |
| Singleton | Logger instances |
| Global error handler | `presentation/middlewares/errorHandler.middleware.ts` |
| Ambient context (IHttpContextAccessor) | `infrastructure/plugins/asyncRequestContext.plugin.ts` |

---

## Contributing

See **[.github/CONTRIBUTING.md](.github/CONTRIBUTING.md)** for branch naming, commit conventions, and PR process.

---

## License

ISC
