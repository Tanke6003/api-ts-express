# API Template — Node.js · Express 5 · TypeScript

A production-ready REST API starter built with **Node.js**, **Express 5**, and **TypeScript**, following **Clean Architecture** principles. Swap databases, loggers, or storage backends by changing a single line in the DI container — every layer is independently testable.

---

## Features

| Category | Implementation |
|----------|---------------|
| Framework | Express 5 |
| Language | TypeScript 5 (strict mode) |
| Architecture | Clean Architecture (Presentation → Application → Domain → Infrastructure) |
| Dependency Injection | tsyringe |
| Authentication | JWT (Bearer token) |
| Database | Sequelize + Tedious (SQL Server) with dummy in-memory fallback |
| Logging | Pino (structured JSON) with pino-pretty in development |
| API Docs | Swagger UI + Scalar |
| File Storage | Local filesystem or AWS S3 / MinIO |
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
| `GET /health` | Health check |
| `GET /api/users` | List users |
| `GET /api/swagger` | Swagger UI |
| `GET /api/scalar` | Scalar API reference |
| `GET /api/generate-token` | Generate a test JWT |

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
│   └── services/
├── domain/                     # Core contracts (no dependencies)
│   ├── interfaces/
│   └── models/
└── infrastructure/             # Concrete implementations
    ├── datasources/            # Dummy (in-memory) & SQL Server
    ├── plugins/                # Pino, Winston, JWT, Sequelize, S3
    └── repositories/
```

Full architecture reference: **[docs/architecture.md](docs/architecture.md)**.

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
| `JWT_SECRET` | — | **Required.** Sign JWT tokens |
| `LOG_LEVEL` | `trace` | Pino log level |
| `DB_DIALECT` | `mssql` | `mssql` / `mysql` / `postgres` |
| `DB_HOST` | `localhost` | Database host |
| `DB_PORT` | `1434` | Database port |
| `DB_USER` | `sa` | Database user |
| `DB_PASSWORD` | — | Database password |
| `DB_NAME` | `testdb` | Database name |

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

Follow the step-by-step guide: **[docs/add-new-module.md](docs/add-new-module.md)**.

---

## Design patterns

| Pattern | Location |
|---------|---------|
| Repository | `infrastructure/repositories/` |
| Dependency Injection | `core/di/container.ts` (tsyringe) |
| Service Layer | `application/services/` |
| DTO | `application/dtos/` |
| Strategy | Pluggable datasources (Dummy ↔ SQL Server) |
| Singleton | Logger instances |
| Global error handler | `presentation/middlewares/errorHandler.middleware.ts` |

---

## Contributing

See **[.github/CONTRIBUTING.md](.github/CONTRIBUTING.md)** for branch naming, commit conventions, and PR process.

---

## License

ISC
