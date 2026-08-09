# Getting Started

This guide walks you from zero to a running API in under 5 minutes.

---

## Prerequisites

| Tool | Minimum version |
|------|----------------|
| Node.js | 18 LTS |
| npm | 9 |
| Git | any |
| Docker + Docker Compose | optional (for SQL Server & MinIO) |

---

## 1. Clone & install

```bash
git clone <repo-url>
cd api-ts-express
npm install
```

---

## 2. Configure environment variables

Copy the template and edit it:

```bash
cp .env.template .env.dev
```

Open `.env.dev` and set at minimum:

```env
PORT=3001
NODE_ENV=development
JWT_SECRET=change_me_to_a_long_random_string
LOG_LEVEL=trace
```

The database variables are only required if you switch from the default **in-memory** datasource to SQL Server. See [environment.md](environment.md) for all variables.

---

## 3. Start the development server

**Windows:**
```bash
npm run dev:win
```

**Linux / macOS:**
```bash
npm run dev
```

Pretty-printed logs (Windows):
```bash
npm run dev:win:pretty
```

You should see:
```
Server running on port 3001
Users:   http://localhost:3001/api/users
Swagger: http://localhost:3001/api/swagger
Scalar:  http://localhost:3001/api/scalar
Health:  http://localhost:3001/health
```

---

## 4. Try the API

### Health check
```bash
curl http://localhost:3001/health
```

### List users (in-memory seed data)
```bash
curl http://localhost:3001/api/users
```

### Generate a JWT token
```bash
curl http://localhost:3001/api/generate-token
```

### Create a user (requires token)
```bash
TOKEN=$(curl -s http://localhost:3001/api/generate-token | jq -r .token)

curl -X POST http://localhost:3001/api/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Alice"}'
```

---

## 5. Explore the documentation

- **Swagger UI** → `http://localhost:3001/api/swagger`
  - Click **Authorize**, paste your token, and test every endpoint interactively.
- **Scalar** → `http://localhost:3001/api/scalar`

---

## 6. Run tests

```bash
npm test
```

This runs unit + integration tests and generates coverage under `reports/`.

---

## 7. (Optional) Start local services with Docker

By default `DATA_SOURCE=dummy`, so the API runs with an in-memory store and needs no database at all.

To run against a real database, start it and flip one environment variable — there is no code to change:

```bash
docker compose up -d oracle     # Oracle 23ai Free; schema + seed applied on first boot
docker compose up -d            # todo (Oracle, SQL Server y MinIO)
```

```env
# .env.dev
DATA_SOURCE=oracle              # o "sqlserver"
ORACLE_PASSWORD=AppPassword1
```

Restart the server; the boot log should show `Conexión con Oracle establecida correctamente.` and `GET /health` will report `"dataSource":"oracle"`.

Full guide: **[oracle.md](oracle.md)**.

---

## The web UI

Open **http://localhost:3001/** for a small HTML + Tailwind interface over the same API: appointments (with or without a registered client), branches and users, including logical delete, restore and hard delete. It lives in `public/` and is served as static files.

---

## Next steps

- Understand the generic repository → [generic-repository.md](generic-repository.md)
- Run against Oracle → [oracle.md](oracle.md)
- Add a new resource → [add-new-module.md](add-new-module.md)
- Understand the architecture → [architecture.md](architecture.md)
- Write tests → [testing.md](testing.md)
- Deploy → [deployment.md](deployment.md)
