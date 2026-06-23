# Environment Variables

All variables are loaded by `DotenvPlugin` from:

| `NODE_ENV` value | File loaded |
|------------------|-------------|
| `development` | `.env.dev` |
| `test` | `.env.test` |
| anything else | `.env` |

Copy `.env.template` as a starting point.

---

## API

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `PORT` | number | `3001` | No | HTTP listening port |
| `NODE_ENV` | string | `development` | No | Runtime environment |
| `SERVICE_NAME` | string | `ApiTSExpress` | No | Appears in structured logs |
| `API_VERSION` | string | `1.0.0` | No | Shown in Swagger info |

---

## Authentication

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `JWT_SECRET` | string | — | **Yes** | Secret key for signing JWT tokens. Use a long random string in production. There is **no insecure default**: the app fails to start (loudly) if it is missing. |

---

## Logging

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `LOG_DRIVER` | string | `pino` | Logger implementation: `pino` (default, structured) or `winston`. An unknown value fails fast at startup. |
| `LOG_LEVEL` | string | `trace` (dev) / `info` (prod) | Log level: `trace`, `debug`, `info`, `warn`, `error`, `fatal` |

In development (`NODE_ENV=development`), Pino logs are pretty-printed via pino-pretty. In other environments, logs are emitted as JSON. Switching `LOG_DRIVER=winston` swaps the logger implementation without any code changes.

---

## Data source selection

The `IUsersDataSource` implementation is selected at startup via `DATA_SOURCE`.

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `DATA_SOURCE` | string | `dummy` | No | `dummy` (in-memory, no DB needed) or `sqlserver` (uses Sequelize). An unknown value fails fast at startup. |

---

## Database (Sequelize)

Only required when `DATA_SOURCE=sqlserver`. When `DATA_SOURCE=sqlserver`, `DB_PASSWORD` becomes a required secret (validated at startup).

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `DB_DIALECT` | string | `mssql` | `mssql` / `mysql` / `mariadb` / `postgres` |
| `DB_HOST` | string | `localhost` | Database host |
| `DB_PORT` | number | `1434` | Database port |
| `DB_USER` | string | `sa` | Database username |
| `DB_PASSWORD` | string | — | Database password |
| `DB_NAME` | string | `testdb` | Database name |

---

## File storage (S3 / MinIO)

Only required when using `S3FileStoragePlugin`.

| Variable | Type | Description |
|----------|------|-------------|
| `S3_BUCKET` | string | Bucket name |
| `S3_REGION` | string | AWS region (e.g. `us-east-1`) |
| `S3_ACCESS_KEY` | string | AWS access key ID |
| `S3_SECRET_KEY` | string | AWS secret access key |
| `S3_ENDPOINT` | string | Custom endpoint URL (for MinIO). Omit for real AWS S3. |

---

## Example `.env.dev`

```env
# API
PORT=3001
NODE_ENV=development
SERVICE_NAME=ApiTSExpress
API_VERSION=1.0.0

# Auth
JWT_SECRET=dev_secret_change_in_production

# Logging
LOG_LEVEL=trace

# Data source: "dummy" (in-memory, default) or "sqlserver"
DATA_SOURCE=dummy

# Database (only if DATA_SOURCE=sqlserver)
DB_DIALECT=mssql
DB_HOST=localhost
DB_PORT=1434
DB_USER=sa
DB_PASSWORD=change_me
DB_NAME=testdb
```
