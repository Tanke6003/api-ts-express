# Error Handling and Request Identity

Two related pieces: a single global error handler that every failure flows through, and a per-request context that carries who is calling — used for auditing and for correlating logs.

---

## 1. The error envelope

Every error, from any layer, comes back in the same shape:

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

- `code` is stable and meant to be branched on by the client; `message` is for humans.
- `errors` appears only for field-level validation.
- `stack` and `causes` appear **only outside production**. In production a 5xx that wasn't anticipated also replaces `message` with a generic `"Internal server error"`, so nothing internal leaks.
- `requestId` is echoed in the `X-Request-Id` response header and appears in the log line for the same request.

Nothing responds with its own error format: `validateBody`, `validateQuery` and the JWT guard all call `next(error)` and let the global handler render it.

---

## 2. What gets recognised

`normalizeError` (`src/core/errors/error-mapper.ts`) maps any thrown value to a status and a code. Most specific first:

| Source | Result |
|--------|--------|
| `AppError` | its own `statusCode`, `code`, `errors` |
| `ZodError` | 400 `VALIDATION_ERROR` + per-field detail |
| `TokenExpiredError` | 401 `TOKEN_EXPIRED` |
| `JsonWebTokenError` / `NotBeforeError` | 401 `INVALID_TOKEN` |
| body-parser `entity.parse.failed` | 400 `MALFORMED_JSON` |
| body-parser `entity.too.large` | 413 `PAYLOAD_TOO_LARGE` |
| Oracle `ORA-…` | see below |
| anything else | 500 `INTERNAL_ERROR`, flagged non-operational |

### Oracle errors

| Code | HTTP | `code` |
|------|------|--------|
| `ORA-00001` | 409 | `DB_UNIQUE_VIOLATION` |
| `ORA-01400` | 400 | `DB_NOT_NULL_VIOLATION` |
| `ORA-02290` | 400 | `DB_CHECK_VIOLATION` |
| `ORA-02291` | 400 | `DB_REFERENCE_NOT_FOUND` |
| `ORA-02292` | 409 | `DB_REFERENCE_IN_USE` |
| `ORA-12899` | 400 | `DB_VALUE_TOO_LARGE` |
| `ORA-01033/03113/03114/12154/12170/12514/12541` | 503 | `DB_UNAVAILABLE` |
| any other `ORA-` | 500 | `DB_ERROR` (not operational) |

The driver's code survives the trip because every wrapper preserves the original in `cause`:

```
UsersRepository.insert failed.            ← BaseModuleRepository.guard
  └─ [OraclePlugin] execute failed        ← OraclePlugin
       └─ ORA-00001: unique constraint…   ← node-oracledb
```

`normalizeError` walks that chain, so a duplicate key answers **409** instead of a blank 500, while the client still never sees the SQL detail.

### Throwing your own

```typescript
throw new AppError("La sucursal ya tiene una cita en ese horario", 409, true, {
  code: "APPOINTMENT_OVERLAP",
});
```

`isOperational: false` (the third argument) marks a bug rather than an expected outcome: it is logged as an error and its message is hidden in production.

---

## 3. Logging

The handler logs once per failure, with everything needed to reconstruct it:

```
requestId, method, path, statusCode, code, userId, userName, error, causes, stack
```

5xx and non-operational errors go to `logger.error`; 4xx go to `logger.warn` — a rejected request is normal traffic, not an alarm.

---

## 4. Middleware order

Order is not cosmetic here:

```typescript
requestContext(context)   // 1º de todo, incluso antes del parseo del cuerpo
express.json()
cors()
logger.http()
express.static("public")
…rutas…
scalar / swagger
notFoundHandler           // 404 con el mismo formato
errorHandler              // siempre el último
```

- `requestContext` goes **before** `express.json()` so a malformed body is still rejected with a `requestId`.
- `notFoundHandler` and `errorHandler` go **after** Swagger and Scalar. An Express error handler only covers routes registered before it, and a 404 handler placed too early would swallow the documentation.

They are registered by `Server.configureErrorHandling()`, which `run()` calls last. A test that builds the app by hand must call it too.

---

## 5. Request identity

`AsyncRequestContextPlugin` is the Node counterpart of `IHttpContextAccessor` in .NET. It uses `AsyncLocalStorage`, so the store survives every `await` and stays isolated between concurrent requests — a plain module variable would leak one user's identity into another's request.

```typescript
context.getCurrentUser();      // { id, name, email } | null
context.getCurrentUserId();    // claim `sub` — para reglas de negocio
context.getCurrentUserName();  // "System" si no hay petición
context.getRequestId();
```

The identity is published by the JWT guard, the single place where a token is validated. Claims are read in order — `name`, `nameComplete`, `preferred_username`, `samaccountname`, `username` — falling back to the email and then to the id, so an authenticated write is never recorded as `System`.

### The token

`GET /api/generate-token` issues a development token carrying `sub`, `name` and `email`. The id travels in `sub`, the standard subject claim:

```bash
curl "http://localhost:3001/api/generate-token?userId=7&name=Ruben&email=ruben@example.com"
```

`GET /api/me` returns what the API resolved from it — the same identity that ends up in the audit columns:

```json
{ "id": "7", "name": "Ruben", "email": "ruben@example.com", "requestId": "7452d8c1-…" }
```

### Business rules

Use the **id**, never the name, for anything that depends on who is asking — names change, ids don't:

```typescript
const userId = this.context.getCurrentUserId();
if (appointment.fkClient !== Number(userId)) {
  throw new AppError("No puedes modificar una cita de otro cliente", 403);
}
```

---

## 6. Audit columns

An entity that declares `audit` gets the writer's name persisted automatically:

```typescript
audit: { createdBy: "createdBy", updatedBy: "updatedBy" }
```

- `insert` and `insertMany` fill `CREATED_BY`.
- `update`, `updateWhere`, `softDelete` and `restore` fill `UPDATED_BY` — a logical delete is a modification and should say who did it.
- Outside a request (seeds, startup, scheduled work) the value is `System`.

The value always comes from the token, **never from the request body**: both repositories skip these properties when mapping the payload, so a client cannot claim to be someone else.

The three demo tables carry `CREATED_BY VARCHAR2(100) DEFAULT 'System' NOT NULL` and `UPDATED_BY VARCHAR2(100)`. Adding them to an existing database:

```sql
ALTER TABLE BRANCHES ADD (CREATED_BY VARCHAR2(100) DEFAULT 'System' NOT NULL, UPDATED_BY VARCHAR2(100));
```

or recreate the container with `docker compose down -v oracle && docker compose up -d oracle`.

> Only the name is stored, matching the usual `CreatedByUser` convention. If you also need the id on the row, add a column, map it, and extend `AuditMetadata` — the repositories already have the id available through the context.

---

## 7. The audit trail

The audit columns only keep the *last* writer. The `AUDIT_LOG` table keeps the whole history, including rows that were later deleted for good.

An entity opts in with one flag:

```typescript
auditTrail: true,
```

From then on every write leaves a line, with no service having to remember anything:

| Action | Recorded detail |
|--------|-----------------|
| `INSERT` | the values written |
| `UPDATE` | `{ before, after }` |
| `SOFT_DELETE` / `RESTORE` | the action alone |
| `HARD_DELETE` | the row's last state — the reason the trail exists |
| `*_MANY` | one line with the filter and how many rows it reached |

Reads never produce a line, and a write that affected nothing doesn't either.

```bash
GET /api/audit?entity=BRANCHES&entityId=4
GET /api/audit?requestId=407215bc-…    # todo lo que hizo una misma petición
```

The endpoint is read-only; there is no way to write a line through the API.

### Two design points worth knowing

**The identity is captured when the operation starts, not when the line is written.** By record time several database round-trips have happened, and a connection pool may resolve its callbacks in the context where the *pool* was created rather than the request's. Reading the user at that point silently attributes everything to `System` — which is exactly what happened before this was fixed. `captureActor()` takes the snapshot before the first `await`.

**The line goes through the same executor as the audited operation.** Inside a transaction it lands in the same commit and disappears with a rollback. A failure to record fails the operation: a trail that silently drops entries is not a trail.

`AUDIT_LOG` itself does not set `auditTrail` — auditing the audit would recurse — and it has no soft delete, because an audit line is not something you delete.
