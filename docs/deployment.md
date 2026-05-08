# Deployment Guide

---

## Local development

### Prerequisites

- Node.js 18+
- Docker + Docker Compose (optional, for SQL Server and MinIO)

### Start the development server

```bash
npm run dev       # Linux / macOS
npm run dev:win   # Windows
```

### Start local services

```bash
docker compose up -d
```

| Service | Host | Port | Credentials |
|---------|------|------|-------------|
| SQL Server 2022 | `localhost` | `1434` | `sa / StrongPassword123!` |
| MinIO API | `localhost` | `9100` | `minioadmin / minioadmin` |
| MinIO Console | `localhost` | `9101` | `minioadmin / minioadmin` |

---

## Production build

```bash
npm run build    # compiles TypeScript to dist/
npm start        # runs dist/main.js
```

On Windows:
```bash
npm run build
npm run start:win
```

Set `NODE_ENV=production` to enable:
- JSON-only logs (no pino-pretty)
- No Sequelize query logging

---

## Environment configuration

| Variable | Production value |
|----------|----------------|
| `NODE_ENV` | `production` |
| `LOG_LEVEL` | `info` or `warn` |
| `JWT_SECRET` | Long random string (32+ chars) |
| `DB_PASSWORD` | Strong password |

Never commit `.env` files. Use secrets management (GitHub Actions Secrets, AWS Secrets Manager, Azure Key Vault, etc.).

---

## Docker (application container)

A minimal `Dockerfile` for the application:

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 3001
CMD ["node", "dist/main.js"]
```

Build and run:

```bash
docker build -t api-ts-express .
docker run -p 3001:3001 --env-file .env api-ts-express
```

---

## Switching the datasource

By default the app uses an **in-memory dummy datasource**. To use SQL Server, edit `src/core/di/container.ts`:

```typescript
// Replace this line:
container.register<IUsersDataSource>("IUsersDataSource", { useClass: UsersDummyDataSource });

// With:
container.register<IUsersDataSource>("IUsersDataSource", { useClass: UsersSqlServerDataSource });
```

Update the database environment variables and restart.

---

## Switching file storage (S3 / MinIO)

In `src/core/di/container.ts`:

```typescript
// Local filesystem (default)
container.register<IFileStorage>("IFileStorage", { useValue: new NativeFileStoragePlugin() });

// S3 / MinIO
container.register<IFileStorage>("IFileStorage", {
  useValue: new S3FileStoragePlugin(
    process.env.S3_BUCKET!,
    process.env.S3_REGION!,
    process.env.S3_ACCESS_KEY!,
    process.env.S3_SECRET_KEY!,
    process.env.S3_ENDPOINT   // omit for real AWS S3
  ),
});
```

---

## CI / CD with GitHub Actions

Three workflows are included:

| Workflow | File | Trigger |
|----------|------|---------|
| CI (unified) | `.github/workflows/ci.yml` | Push / PR |
| Tests | `.github/workflows/test.yml` | Push / PR |
| Lint | `.github/workflows/lint.yml` | Push / PR |

The unified `ci.yml` runs lint → typecheck → tests → security audit in parallel jobs.

### Required secrets

| Secret | Description |
|--------|-------------|
| None | No secrets needed for current workflows |

Add `JWT_SECRET`, DB credentials, etc. as repository secrets if you add integration tests that hit a real database in CI.

---

## Health check

The `/health` endpoint returns:

```json
{
  "status": "ok",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "uptime": 42
}
```

Use this with load balancer health checks (AWS ALB, NGINX, etc.).
