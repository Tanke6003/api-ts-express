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

`DATA_SOURCE` selects, at startup, both the `IUsersDataSource` implementation and the driver behind the generic repository (branches, appointments).

| Variable | Type | Default | Required | Description |
|----------|------|---------|----------|-------------|
| `DATA_SOURCE` | string | `dummy` | No | `dummy` (in-memory, no DB needed), `oracle` (node-oracledb, thin mode) or `sqlserver` (Sequelize). An unknown value fails fast at startup. |

`dummy` and `oracle` share the same code path — the generic repository — backed by memory or by Oracle respectively. See **[docs/generic-repository.md](generic-repository.md)**.

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

## Database (Oracle)

Only required when `DATA_SOURCE=oracle`, in which case `ORACLE_PASSWORD` becomes a required secret (validated at startup). Defaults match `docker-compose.yml`, so `docker compose up -d oracle` needs no extra configuration.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ORACLE_USER` | string | `appuser` | Schema owner. The API never connects as `SYS`. |
| `ORACLE_PASSWORD` | string | — | **Required** when `DATA_SOURCE=oracle` |
| `ORACLE_CONNECT_STRING` | string | `localhost:1521/FREEPDB1` | Easy Connect: `host:port/service` |
| `ORACLE_POOL_MIN` | number | `1` | Minimum pooled connections |
| `ORACLE_POOL_MAX` | number | `10` | Maximum pooled connections |
| `ORACLE_POOL_INCREMENT` | number | `1` | Connections added when the pool grows |

Unusable pool sizes (non-numeric, zero, negative) fall back to the defaults instead of propagating a `NaN`.

These two are read by `docker-compose.yml` only, never by the app:

| Variable | Default | Description |
|----------|---------|-------------|
| `ORACLE_SYS_PASSWORD` | `OraclePassword1` | `SYS` / `SYSTEM` password used to bootstrap the container |
| `ORACLE_PORT` | `1521` | Host port mapped to the container |

Full guide: **[docs/oracle.md](oracle.md)**.

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

# Data source: "dummy" (in-memory, default), "oracle" or "sqlserver"
DATA_SOURCE=dummy

# Database (only if DATA_SOURCE=sqlserver)
DB_DIALECT=mssql
DB_HOST=localhost
DB_PORT=1434
DB_USER=sa
DB_PASSWORD=change_me
DB_NAME=testdb

# Oracle (only if DATA_SOURCE=oracle)
ORACLE_USER=appuser
ORACLE_PASSWORD=change_me
ORACLE_CONNECT_STRING=localhost:1521/FREEPDB1
```
