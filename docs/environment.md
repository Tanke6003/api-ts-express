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
| `JWT_SECRET` | string | — | **Yes** | Secret key for signing JWT tokens. Use a long random string in production. |

---

## Logging

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `LOG_LEVEL` | string | `trace` (dev) / `info` (prod) | Pino log level: `trace`, `debug`, `info`, `warn`, `error`, `fatal` |

In development (`NODE_ENV=development`), logs are pretty-printed via pino-pretty. In other environments, logs are emitted as JSON.

---

## Database (Sequelize)

Only required when using `UsersSqlServerDataSource` (switched in `src/core/di/container.ts`).

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

# Database (only if using SQL Server datasource)
DB_DIALECT=mssql
DB_HOST=localhost
DB_PORT=1434
DB_USER=sa
DB_PASSWORD=StrongPassword123!
DB_NAME=testdb
```
