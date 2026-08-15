# Getting Started

From a clean clone to a running API, then to a real database and to production.

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 20 (the version CI builds and tests on) |
| npm | ships with Node |
| Git | any |
| Docker + Docker Compose | optional — only to run a real database or MinIO |

Out of the box `DATA_SOURCE=dummy`, so the whole API runs in memory. Docker is not needed to get started.

---

## 1. Install

```bash
git clone <repo-url>
cd api-ts-express
npm install
```

No native build step is required: `node-oracledb` runs in thin mode, so there is no Oracle Instant Client to install.

---

## 2. Configure

`DotenvPlugin` picks the file to load from `NODE_ENV`:

| `NODE_ENV` | File loaded |
|------------|-------------|
| `development` (default) | `.env.dev` |
| `test` | `.env.test` |
| anything else | `.env` |

```bash
cp .env.template .env.dev
```

The only variable you must set is `JWT_SECRET`. It has no insecure default: `validateCriticalEnvs` throws at startup listing what is missing, so a deployment can never silently sign tokens with a placeholder. Each driver's password is validated the same way, but only for the driver named in `DATA_SOURCE` — you should not have to invent Oracle credentials to run on PostgreSQL.

```env
PORT=3001
NODE_ENV=development
JWT_SECRET=change_me_to_a_long_random_string
DATA_SOURCE=dummy
LOG_LEVEL=trace
```

Tests need no env file at all: `tests/setup/test-env.ts` injects a `JWT_SECRET` before the container loads.

### API

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP listening port. `.env.template` ships `3001`. |
| `NODE_ENV` | `development` | Selects the env file, log format and Sequelize query logging |
| `SERVICE_NAME` | `api-ts-express` | Emitted as `service` on every log line |
| `API_VERSION` | `dev` | Emitted as `version` on every log line |

### Authentication

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `JWT_SECRET` | — | **Always** | Key used to sign and verify tokens |

### Logging

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_DRIVER` | `pino` | `pino` or `winston`. An unknown value fails fast at startup. |
| `LOG_LEVEL` | `debug` | `trace`, `debug`, `info`, `warn`, `error`, `fatal` |

Pino pretty-prints when `NODE_ENV` is `development`; everywhere else it emits JSON. Swapping `LOG_DRIVER` changes nothing else — the logger is resolved through `TOKENS.ILogger`.

### Data source

`DATA_SOURCE` picks, at startup, the driver behind every repository and the unit of work.

| Value | Engine |
|-------|--------|
| `dummy`, `memory` | In-memory, seeded, no database |
| `oracle` | Oracle via `node-oracledb` (thin mode) |
| `sqlserver`, `mssql` | SQL Server via Sequelize |
| `postgres`, `postgresql` | PostgreSQL via Sequelize |
| `mysql`, `mariadb` | MySQL / MariaDB via Sequelize |
| `mongodb`, `mongo` | MongoDB via the `mongodb` driver |

Anything else throws at startup instead of falling back to memory. A mistyped `postgress` would otherwise boot happily and only surface much later, as data that does not persist.

### Oracle — required when `DATA_SOURCE=oracle`

| Variable | Default | Description |
|----------|---------|-------------|
| `ORACLE_USER` | `appuser` | Schema owner. The API never connects as `SYS`. |
| `ORACLE_PASSWORD` | — | **Required** |
| `ORACLE_CONNECT_STRING` | `localhost:1521/FREEPDB1` | Easy Connect: `host:port/service` |
| `ORACLE_POOL_MIN` | `1` | Idle connections kept. `0` is valid — keep none. |
| `ORACLE_POOL_MAX` | `10` | Maximum pooled connections |
| `ORACLE_POOL_INCREMENT` | `1` | Connections added when the pool grows |

Unusable pool values (non-numeric, negative, or zero where zero is meaningless) fall back to the default rather than propagating a `NaN` into the driver.

### SQL Server, PostgreSQL, MySQL

Each engine reads its own prefix, so several can be configured at once and you switch by editing `DATA_SOURCE` alone.

| | `sqlserver` | `postgres` | `mysql` |
|---|---|---|---|
| Host | `DB_HOST` (`localhost`) | `POSTGRES_HOST` (`localhost`) | `MYSQL_HOST` (`localhost`) |
| Port | `DB_PORT` (`1434`) | `POSTGRES_PORT` (`5433`) | `MYSQL_PORT` (`3307`) |
| User | `DB_USER` (`sa`) | `POSTGRES_USER` (`appuser`) | `MYSQL_USER` (`appuser`) |
| Password | `DB_PASSWORD` (**required**) | `POSTGRES_PASSWORD` (**required**) | `MYSQL_PASSWORD` (**required**) |
| Database | `DB_NAME` (`testdb`) | `POSTGRES_DB` (`testdb`) | `MYSQL_DB` (`testdb`) |

All three also accept `<PREFIX>_POOL_MIN` (default `0`) and `<PREFIX>_POOL_MAX` (default `10`).

### MongoDB — `DATA_SOURCE=mongodb`

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGO_HOST` | `localhost` | Host |
| `MONGO_PORT` | `27017` | Port |
| `MONGO_DB` | `testdb` | Database |
| `MONGO_USER` | *(empty)* | Left empty, the connector sends no credentials |
| `MONGO_PASSWORD` | *(empty)* | Same |

MongoDB is the one engine whose password is not enforced at startup: its development container runs without authentication, so requiring a password would block the normal case.

### Consumed only by `docker-compose.yml`

| Variable | Default | Description |
|----------|---------|-------------|
| `ORACLE_SYS_PASSWORD` | `OraclePassword1` | `SYS` / `SYSTEM` password used to bootstrap the container |
| `ORACLE_PORT` | `1521` | Host port mapped to the Oracle container |
| `MYSQL_ROOT_PASSWORD` | `RootPassword1` | Only so the image can apply the schema; the API never uses it |

---

## 3. Run locally

```bash
npm run dev          # Linux / macOS
npm run dev:win      # Windows
npm run dev:win:pretty   # Windows, piped through pino-pretty
```

All three run `tsx watch src/main.ts`, so edits reload without a build step. The boot log ends with:

```
INFO: Servidor escuchando
  port: 3001
  ui: http://localhost:3001/
  users: http://localhost:3001/api/v1/users
  swagger: http://localhost:3001/api/swagger
  scalar: http://localhost:3001/api/scalar
  health: http://localhost:3001/health/ready
```

Swagger and Scalar only appear when the documentation is published — everywhere
except production, unless `DOCS_ENABLED` says otherwise.

With a real driver the process authenticates against the database *before* it starts listening, and exits with code 1 if that fails. A wrong password shows up in the boot log rather than in a user's first request.

Tests need nothing running:

```bash
npm test              # unit + e2e, with coverage
npm run test:watch    # watch mode
npm run test:local    # verbose, HTML report under reports/
```

Coverage lands in `reports/coverage/`, the test report in `reports/tests-report.html`. See [testing.md](testing.md).

---

## 4. The endpoints

Everything except `/health*`, `/api/v1/generate-token` and the upload routes
requires `Authorization: Bearer <token>`. Routes require a token unless they
declare `public: true`, so forgetting the flag closes an endpoint rather than
opening one.

The API is mounted at `API_PREFIX` (`/api/v1` by default) and also answers under
the unversioned `/api` while `API_LEGACY_PREFIX` is on. The prefix in use is
published by `/health/ready`, so a client can discover it instead of assuming
it.

```bash
curl http://localhost:3001/health
curl http://localhost:3001/api/v1/generate-token          # ?userId=7&name=Ruben to simulate a user

TOKEN=$(curl -s http://localhost:3001/api/v1/generate-token | jq -r .token)
curl -X POST http://localhost:3001/api/v1/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Alice", "email": "alice@example.com"}'
```

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/health/live` | — | Liveness: the process answers. Never touches the database |
| `GET` | `/health/ready` | — | Readiness: 503 if the database is down or the app is draining |
| `GET` | `/health` | — | Alias of `/health/ready` |
| `GET` | `/api/v1/generate-token` | — | Development JWT; accepts `userId`, `name`, `email` |
| `GET` | `/api/v1/users` | Bearer | Paginated list (`page`, `limit`) |
| `GET` | `/api/v1/users/:id` | Bearer | Single user |
| `POST` | `/api/v1/users` | Bearer | Create — `name` required, `email` / `phone` / `isClient` optional |
| `PUT` | `/api/v1/users/:id` | Bearer | Update |
| `DELETE` | `/api/v1/users/:id` | Bearer | Logical delete |
| `GET` | `/api/v1/branches` | Bearer | Paginated list |
| `GET` | `/api/v1/branches/:id` | Bearer | Single branch |
| `POST` | `/api/v1/branches` | Bearer | Create |
| `PUT` | `/api/v1/branches/:id` | Bearer | Update |
| `DELETE` | `/api/v1/branches/:id` | Bearer | Logical delete |
| `DELETE` | `/api/v1/branches/:id/hard` | Bearer | Physical delete |
| `POST` | `/api/v1/branches/:id/restore` | Bearer | Undo a logical delete |
| `GET` | `/api/v1/appointments` | Bearer | Paginated list; filters combine with AND |
| `GET` | `/api/v1/appointments/stats` | Bearer | Aggregates |
| `GET` | `/api/v1/appointments/:id` | Bearer | Single appointment |
| `POST` | `/api/v1/appointments` | Bearer | Create |
| `PUT` | `/api/v1/appointments/:id` | Bearer | Update |
| `DELETE` | `/api/v1/appointments/:id` | Bearer | Logical delete |
| `DELETE` | `/api/v1/appointments/:id/hard` | Bearer | Physical delete |
| `POST` | `/api/v1/appointments/:id/restore` | Bearer | Undo a logical delete |
| `GET` | `/api/v1/me` | Bearer | Identity resolved from the token |
| `GET` | `/api/v1/audit` | Bearer | Change log, read-only |
| `POST` | `/api/v1/upload-file` | — | One file, multipart, up to 5 MB |
| `POST` | `/api/v1/upload-files` | — | Up to 10 files, multipart, 5 MB each |

Interactive documentation is generated from the OpenAPI annotations on the route files:

- Swagger UI — `http://localhost:3001/api/swagger` (click **Authorize**, paste the token, and the header persists across requests)
- Scalar — `http://localhost:3001/api/scalar`
- Raw spec — `http://localhost:3001/api/openapi.json`

`http://localhost:3001/` serves a small HTML + Tailwind UI over the same API — appointments (with or without a registered client), branches and users, including logical delete, restore and hard delete. It lives in `public/` and is served as static files.

---

## 5. Local services with Docker

Start only what you need; `docker compose up -d` with no argument brings up all six containers.

```bash
docker compose up -d oracle
docker compose up -d mssql
docker compose up -d postgres
docker compose up -d mysql
docker compose up -d mongo
docker compose up -d minio
```

| Service | Compose name | Host port | Credentials | Schema + seed |
|---------|--------------|-----------|-------------|---------------|
| Oracle 23ai Free | `oracle` | `1521` | `appuser / AppPassword1` (`SYS`: `OraclePassword1`) | On first boot |
| SQL Server 2022 | `mssql` | `1434` | `sa / StrongPassword123!` | On first boot, via `mssql-init` |
| PostgreSQL 16 | `postgres` | `5433` | `appuser / AppPassword1` | On first boot |
| MySQL 8 | `mysql` | `3307` | `appuser / AppPassword1` | On first boot |
| MongoDB 7 | `mongo` | `27017` | none — runs without authentication | On first boot |
| MinIO API | `minio` | `9100` | `minioadmin / minioadmin` | — |
| MinIO Console | `minio` | `9101` | `minioadmin / minioadmin` | — |

**The non-standard ports are deliberate.** A locally installed SQL Server on 1433, PostgreSQL on 5432 or MySQL on 3306 silently wins over the Docker mapping on `localhost`, and the symptom is a confusing authentication failure against a database you never configured. Publishing on 1434, 5433 and 3307 removes the collision; the app defaults match, so nothing extra to configure.

Schemas and seeds live under `docker/<engine>/` and mirror the same three example tables plus `AUDIT_LOG`. Four of the five images apply them from their own `initdb.d`. SQL Server has no such hook, so a companion container does the job: `mssql-init` waits for the server to report healthy, applies `01_schema.sql` and `02_seed.sql`, and exits. It checks whether `BRANCHES` already exists first, so bringing it up again does not duplicate the seed, and starting it pulls SQL Server up with it:

```bash
docker compose up -d mssql-init
```

Compose reads its defaults from the same variable names the app uses (`DB_PASSWORD`, `ORACLE_PASSWORD`, `POSTGRES_PASSWORD`, `MYSQL_PASSWORD`, and the `*_PORT` ones), so container and application cannot drift apart. Note that Compose reads `.env`, not `.env.dev` — with only `.env.dev` present the containers come up on the defaults in the table above, which is exactly what `.env.template` ships.

Two engine-specific consequences:

- **MongoDB runs as a single-node replica set** (`--replSet rs0`). The generic repository writes each operation and its `AUDIT_LOG` entry inside one transaction, and multi-document transactions only exist on a replica set. A standalone `mongod` rejects `startTransaction`, so the API would not boot.
- **MongoDB has no root user by design.** Setting `MONGO_INITDB_ROOT_USERNAME` makes the entrypoint drop `--replSet` from its temporary server and demand an internal-authentication keyfile, which defeats the point above.

Switching engine is one variable and a restart:

```env
DATA_SOURCE=postgres
POSTGRES_PASSWORD=AppPassword1
```

`GET /health` reports the driver actually in use. Details in [data-access.md](data-access.md).

---

## 6. Production

```bash
npm run build     # tsc -> dist/
npm start         # NODE_ENV=production node dist/main.js
npm run start:win # Windows
```

`NODE_ENV=production` changes two things: Pino emits JSON instead of routing through pino-pretty, and Sequelize stops logging every statement.

| Variable | Production value |
|----------|-----------------|
| `NODE_ENV` | `production` |
| `LOG_LEVEL` | `info` or `warn` |
| `JWT_SECRET` | Long random string, 32+ characters |
| `DATA_SOURCE` | The target engine |
| Driver password | The secret for that engine only |

Never commit `.env` files — use the platform's secret store. The startup validation is the safety net, not the strategy: it refuses to boot without the secrets, but it cannot tell a strong secret from `change_me`.

On `SIGINT` and `SIGTERM` the process drains in four steps: it stops reporting
itself as ready, waits `SHUTDOWN_DELAY_MS` for the load balancer to notice, stops
accepting connections and lets the in-flight requests finish, and only then
returns the connection pool. A watchdog capped at `SHUTDOWN_TIMEOUT_MS` forces
the exit if any step hangs.

That waiting step is what removes the 502s on a rolling deploy: closing the
socket before the balancer knows loses whatever it routed in the meantime.
Behind Kubernetes, set `SHUTDOWN_DELAY_MS=5000` and keep `SHUTDOWN_TIMEOUT_MS`
below `terminationGracePeriodSeconds`.

Probes are split, because an orchestrator does opposite things with each answer:

| Endpoint | Question | Behaviour |
|----------|----------|-----------|
| `GET /health/live` | Is the process alive? | Always `200`. Never touches the database — restarting cannot fix someone else's database |
| `GET /health/ready` | Can it take traffic? | `503` if the database is down or the app is draining, so the balancer routes elsewhere |
| `GET /health` | — | Alias of `/health/ready` |

```json
{
  "status": "ok",
  "dataSource": "postgres",
  "database": "up",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "uptime": 42
}
```

The database check is capped at 2 s and its result cached for 3 s, so a probe
every second does not turn into a query every second against every replica.

GitHub Actions runs lint, TypeScript build, tests with coverage and a dependency audit as parallel jobs on every push and pull request (`.github/workflows/ci.yml`, plus standalone `lint.yml` and `test.yml`). No repository secrets are needed as configured.

### File storage

`IFileStorage` is registered in `src/core/di/modules/plugins.module.ts` against `TOKENS.IFileStorage`:

```typescript
// Local filesystem (default). Registered as a class, not an instance, so the
// upload directory is only created when something actually resolves it.
container.registerSingleton<IFileStorage>(TOKENS.IFileStorage, NativeFileStoragePlugin);

// S3 / MinIO. This plugin takes its configuration as constructor arguments, so
// it has to be registered as an already-built instance.
container.register<IFileStorage>(TOKENS.IFileStorage, {
  useValue: new S3FileStoragePlugin(
    bucket,
    region,
    accessKey,
    secretKey,
    endpoint // required for MinIO; omit for real AWS S3
  ),
});
```

Nothing reads S3 credentials from the environment, and the two upload routes build their own `S3FileStoragePlugin` pointed at the local MinIO container instead of resolving `TOKENS.IFileStorage` — swapping the registration alone will not redirect them.

---

## Next steps

- Understand the layers → [architecture.md](architecture.md)
- Repositories, dialects and connectors → [data-access.md](data-access.md)
- Add a new resource → [add-new-module.md](add-new-module.md)
- Write tests → [testing.md](testing.md)
