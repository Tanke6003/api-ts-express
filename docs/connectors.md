# Database Connectors

Five engines behind one repository contract. Switching between them is a single environment variable — there is no code to change.

```env
DATA_SOURCE=dummy       # en memoria, sin Docker
DATA_SOURCE=oracle
DATA_SOURCE=sqlserver
DATA_SOURCE=postgres
DATA_SOURCE=mysql       # o mariadb
DATA_SOURCE=mongodb
```

An unknown value **fails at startup** rather than falling back to memory: a mistyped `postgress` would otherwise boot in memory and only surface much later, as data that doesn't persist.

---

## 1. The layers

```
IGenericRepository<T>          ← lo que ven los servicios. Idéntico en los 5 motores.
        │
        ├── SqlGenericRepository   ── SqlDialect ── oracle · mssql · postgres · mysql
        ├── MongoGenericRepository
        └── MemoryGenericRepository
                │
        IDbPlugin                  ← ciclo de vida de la conexión
        └── ISqlDbPlugin           ← + ejecutar sentencias y abrir transacciones
```

**Where the uniformity actually lives.** Services see `IGenericRepository<T>`, and there all five engines behave identically. The plugin contract below is deliberately thinner: `IDbPlugin` only covers `engine`, `authenticate` and `close`, because that is all a relational and a document store genuinely share. Pretending to unify further would mean pretending MongoDB can be sent SQL.

The four SQL engines share **one** `SqlGenericRepository`. What differs between them is isolated in a `SqlDialect`, so there are no per-engine repository subclasses — four near-identical classes would be duplication, not abstraction.

---

## 2. What a dialect encodes

Only three things actually differ between the SQL engines:

| | Generated PK | Server "now" | Pagination |
|---|---|---|---|
| Oracle | `RETURNING … INTO` (out bind) | `SYSTIMESTAMP` | `OFFSET … FETCH NEXT` |
| SQL Server | `OUTPUT INSERTED` | `SYSDATETIME()` | `OFFSET … FETCH NEXT` |
| PostgreSQL | `RETURNING` | `NOW()` | `OFFSET … FETCH NEXT` |
| MySQL / MariaDB | the driver (`LAST_INSERT_ID()`) | `CURRENT_TIMESTAMP(3)` | `LIMIT … OFFSET` |

`OUTPUT INSERTED` is preferred over `SCOPE_IDENTITY()` because it doesn't depend on session scope. MySQL is the odd one out twice: it has neither `RETURNING` nor `OUTPUT`, and it doesn't understand `OFFSET … FETCH NEXT`.

That first row is why `ISqlExecutor.execute` takes an `expects` hint (`rows` | `affected` | `identity`): the repository knows whether a statement yields a result set, a row count or a generated id, and each connector answers accordingly. Oracle ignores the hint — it returns all three in one response.

### The timezone trap

Sequelize escapes a `Date` as **local time with offset**. SQL Server and MySQL drop that offset when storing it, then read the column back **as if it were UTC**, so every round-trip shifted by the local offset. The symptom was subtle: the appointment overlap rule silently stopped detecting clashes, because the JS-side comparison saw times six hours off.

Both dialects now normalise `Date` binds to UTC without an offset, which is exactly what the read side assumes. Oracle and PostgreSQL don't need it — `node-oracledb` preserves the instant, and PostgreSQL's column is `TIMESTAMPTZ`.

If you add another engine, **test a date round-trip explicitly**. It is the failure this codebase hit twice.

---

## 3. Connectors

| Engine | Plugin | Driver |
|--------|--------|--------|
| Oracle | `OraclePlugin` | `node-oracledb` 7, thin mode (no Instant Client) |
| SQL Server · PostgreSQL · MySQL | `SequelizeDbPlugin` | Sequelize + tedious / pg / mysql2 |
| MongoDB | `MongoDbPlugin` | `mongodb` driver |

One connector covers three engines because Sequelize speaks all three; what changes between them lives in the dialect, not the connector. The only thing `SequelizeDbPlugin` resolves per engine is how to ask the driver for two things not all of them report the same way: affected rows and the generated id.

> **Binds.** Sequelize `replacements` are escaped and interpolated, not server-side parameters. Sequelize escapes per dialect so it is safe against injection, but it does not reuse execution plans the way a real bind would. `node-oracledb` does use real binds.

---

## 4. Connections

A pooled `connection.close()` returns the connection to the pool; it does not tear down the socket. Every acquisition is paired with a release in a `finally`, so a connection is held only for the statement — except inside a transaction, where one connection is deliberately held for the whole block, because a `COMMIT` only makes sense on the session that did the writes. Keep those blocks short.

The pool itself lives for the process and is drained on `SIGINT`/`SIGTERM`.

`ORACLE_POOL_MIN=0` keeps no idle connections; measured against a real Oracle, idle connections drop from 2 to 1 after `poolTimeout` and stay there — the driver keeps one for the pool itself.

---

## 5. Docker

```bash
docker compose up -d oracle      # 1521, esquema y seed en el primer arranque
docker compose up -d mssql       # 1434
docker compose up -d postgres    # 5433
docker compose up -d mysql       # 3307
docker compose up -d mongo       # 27017, réplica de un nodo
```

Schemas and seeds live under `docker/<engine>/`, all mirroring the same three example tables plus `AUDIT_LOG`.

> **Non-standard ports are deliberate.** A locally installed SQL Server on 1433 and PostgreSQL on 5432 will silently win over the Docker mapping on `localhost`, and the symptom is a confusing "login failed" against a database you never configured. Both collisions happened on the machine this was built on.

Two engine-specific notes:

- **PostgreSQL folds unquoted identifiers to lowercase.** The schema is created without quotes so the uppercase SQL the repository generates resolves against it, and column-to-property mapping is case-insensitive so lowercase results map back. Quoting the DDL is precisely what would break it.
- **MongoDB runs as a single-node replica set.** Multi-document transactions require one, and the example uses them. A standalone `mongod` would fail the branch-deletion flow.

---

## 6. Adding an engine

If it is SQL and Sequelize speaks it, it is a dialect plus three lines of wiring:

1. Add the dialect in `base/dialects/sql.dialect.ts`.
2. Add it to `SEQUELIZE_DEFAULTS` and `SEQUELIZE_DIALECTS` in `core/di/repository.factory.ts`.
3. Add the alias in `DRIVER_ALIASES`, the variables in `.env.template`, and the schema in `docker/<engine>/`.

If it is not SQL, it needs its own `IGenericRepository<T>` implementation, its filter translator and its unit of work — that is what MongoDB has. Use `MemoryGenericRepository` as the reference: it implements the same contract with no SQL at all.

Either way, **do not add it to `DRIVER_ALIASES` before the implementation exists**. Listing it early makes `DATA_SOURCE` boot in memory and hide the problem, which is the one thing that table is there to prevent.
