# Data Access

Every module in this template reads and writes through a single contract, `IGenericRepository<T>`: describe a table once and you get the classic CRUD, a declarative filter language, chainable LINQ-style queries, paging, logical delete and transactions — without writing SQL.

Six engines implement that contract. Choosing one is a single environment variable; there is no code to change:

```env
DATA_SOURCE=dummy       # in memory, no Docker
DATA_SOURCE=oracle
DATA_SOURCE=sqlserver
DATA_SOURCE=postgres
DATA_SOURCE=mysql       # or mariadb
DATA_SOURCE=mongodb
```

An unknown value **fails at startup** instead of falling back to memory: a mistyped `postgress` would otherwise boot in memory and only surface much later, as data that doesn't persist.

---

## What the generic repository gives you

```
IGenericRepository<T>              ← what services see. Identical on every engine.
        │
        ├── SqlGenericRepository     ── SqlDialect ── oracle · mssql · postgres · mysql
        ├── MongoGenericRepository
        └── MemoryGenericRepository
                    │
            IDbPlugin                ← connection lifecycle
            └── ISqlDbPlugin         ← + execute statements and open transactions
```

**The uniformity lives at the top.** Services see `IGenericRepository<T>`, and there every engine behaves the same. The plugin contract underneath is deliberately thinner: `IDbPlugin` covers only `engine`, `authenticate` and `close`, because that is all a relational and a document store genuinely share. Pretending to unify further would mean pretending MongoDB can be sent SQL.

The four SQL engines share **one** `SqlGenericRepository`; everything that differs between them is isolated in a `SqlDialect`. Four near-identical subclasses would be duplication, not abstraction. MongoDB and the in-memory store have their own implementations of the same interface.

A module gets that repository through `BaseModuleRepository`, which delegates every generic method to the store configured by `DATA_SOURCE` and adds the error logging this project expects, so no per-method `try/catch` is needed:

```typescript
@injectable()
export class BranchesRepository
  extends BaseModuleRepository<IBranch>
  implements IBranchesRepository
{
  constructor(
    @inject(TOKENS.BranchesStore) store: IGenericRepository<IBranch>,
    @inject(TOKENS.ILogger) logger: ILogger
  ) {
    super(store, logger, "BranchesRepository");
  }
}
```

Failures are logged with the driver's detail and re-thrown as `BranchesRepository.<operation> failed.`, with the original error in `cause` — so the global handler can still recognise a unique-constraint violation and answer 409 instead of a blanket 500.

### The guarantee that the engines agree

`tests/contract/generic-repository.contract.ts` is not a test by itself: it is the set of assertions **every** implementation must pass, invoked by each driver with its own factory. Insert semantics, filter operators, ordering, paging, projections, idempotent soft delete, `hardDeleteWhere` reaching logically deleted rows — all of it is asserted once and replayed per driver. That is what turns "all engines behave alike" into something checked rather than promised. See [testing.md](testing.md).

---

## Describing an entity

The domain model stays a plain interface. The mapping lives in infrastructure, in `src/infrastructure/repositories/entities.ts`, and it is the only place a column name appears:

```typescript
export const BRANCHES_ENTITY = defineEntity<IBranch>({
  table: ENTITY_NAMES.BRANCHES,
  primaryKey: "pkBranch",
  identity: true,
  columns: {
    pkBranch:  { name: "PK_BRANCH", kind: "number", insertable: false, updatable: false },
    name:      { name: "NAME",      kind: "string" },
    address:   { name: "ADDRESS",   kind: "string" },
    phone:     { name: "PHONE",     kind: "string" },
    opensAt:   { name: "OPENS_AT",  kind: "string" },
    closesAt:  { name: "CLOSES_AT", kind: "string" },
    available: { name: "AVAILABLE", kind: "boolean" },
    createdAt: { name: "CREATED_AT", kind: "date", updatable: false },
    updatedAt: { name: "UPDATED_AT", kind: "date" },
    createdBy: { name: "CREATED_BY", kind: "string", updatable: false },
    updatedBy: { name: "UPDATED_BY", kind: "string" },
  },
  softDelete: { property: "available", activeValue: 1, deletedValue: 0 },
  timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
  audit: { createdBy: "createdBy", updatedBy: "updatedBy" },
  auditTrail: true,
});
```

`columns` must cover every property of the model — TypeScript enforces it. Renaming a physical column is a one-line change.

| Field | Meaning |
|-------|---------|
| `identity` | `true` (default): the database generates the PK. `false`: the caller must supply it, and an insert without it throws. |
| `insertable` / `updatable` | `false` for columns the database owns (identity PKs, `CREATED_AT`). Default `true`. |
| `kind` | Drives conversions in both directions: `boolean` ↔ `1/0`, `date` ↔ `Date`, `number`, `string`. Defaults to `string`. |
| `softDelete` | Column that marks a row as logically deleted. Omit it and the entity simply has no logical delete. `activeValue`/`deletedValue` default to `1`/`0`. |
| `timestamps` | `createdAt` / `updatedAt`. Never taken from the request body. |
| `audit` | `createdBy` / `updatedBy`, filled from the request context — the identity in the token, never the body, so a client cannot claim to be someone else. Outside a request (seeds, startup) the value is `System`. |
| `auditTrail` | `true` to write a line to `AUDIT_LOG` on every write. Opt-in per entity: the log table itself must not enable it, and not every entity is worth an extra row per operation. |

A column definition can also be just its name (`name: "NAME"`) when every default suits it.

At runtime the metadata is wrapped in an `EntitySchema`, which resolves those shortcuts, indexes columns case-insensitively (Oracle returns identifiers uppercased, PostgreSQL lowercased — the same mapping resolves both) and centralises the type conversions. Its `columnOf()` **throws when a property is not mapped**, which is the barrier that keeps an arbitrary name out of a generated query.

Adding a whole new entity — model, `ENTITY_NAMES`, mapping, seed, DI registration — is walked through in [add-new-module.md](add-new-module.md). None of those steps involve SQL.

---

## CRUD

`IGenericRepository<T, TKey>` (`src/domain/interfaces/infrastructure/repositories/generic.repository.interface.ts`):

```typescript
getAll(options?: QueryOptions<T>): Promise<T[]>
getPaged(page, limit, options?): Promise<PagedResult<T>>       // { items, total, page, limit, pages }
getById(id, options?: Pick<QueryOptions<T>, "select" | "withDeleted">): Promise<T | null>
find(options: QueryOptions<T>): Promise<T[]>
firstOrDefault(options?): Promise<T | null>
count(where?, withDeleted?): Promise<number>
exists(where, withDeleted?): Promise<boolean>

insert(entity: Partial<T>): Promise<T>              // the persisted entity, PK included
insertMany(entities: Partial<T>[]): Promise<number> // rows written
update(id, changes: Partial<T>): Promise<T | null>  // null if the row does not exist
updateWhere(where, changes): Promise<number>        // rows affected

softDelete(id): Promise<boolean>
restore(id): Promise<boolean>
hardDelete(id): Promise<boolean>
hardDeleteWhere(where): Promise<number>

query(): IQueryable<T>
```

`QueryOptions<T>` carries `where`, `orderBy`, `skip`, `take`, `select` and `withDeleted`.

Behaviour worth knowing, because it is the same on every engine and the contract suite pins it down:

- **Reads exclude logically deleted rows by default.** Pass `withDeleted: true` to include them — the equivalent of EF Core's `IgnoreQueryFilters()`.
- **`insert` re-reads the row it wrote** and returns that, so what the caller gets back includes the generated PK and every default the database applied. An insert with nothing to write is an error, not an empty row.
- **`update` with no updatable change is not an error**: it returns the current state. Returning `null` would be read as "does not exist". A PK arriving in the change set is ignored.
- **`updateWhere` does not reach logically deleted rows**; `hardDeleteWhere` deliberately does (see below).
- **Timestamps and audit columns are never taken from the payload.** On the SQL engines `CREATED_AT` / `UPDATED_AT` are written with the server's own expression, so they do not depend on the Node process clock.
- **`select` projects**: the columns not asked for are absent from the result rather than present as `undefined`.

---

## The filter language

Declarative, not stringly-typed. Every value travels as a named bind and every column name is resolved through the entity mapping, so user input never reaches the statement text.

```typescript
// Direct equality
await branches.find({ where: { name: "Sucursal Centro" } });

// Operators
await appointments.find({
  where: {
    fkBranch: 1,
    durationMin: { gte: 30, lte: 90 },
    status: { notIn: ["CANCELLED", "DONE"] },
    guestName: { ilike: "%walk-in%" },
    fkClient: { isNull: true },
    scheduledAt: { between: [from, to] },
  },
});

// Nested groups
await branches.getPaged(page, limit, {
  where: {
    $or: [{ name: { ilike: `%${search}%` } }, { address: { ilike: `%${search}%` } }],
  },
});
```

| Operator | SQL | MongoDB | In memory |
|----------|-----|---------|-----------|
| `eq` `ne` `gt` `gte` `lt` `lte` | `=` `<>` `>` `>=` `<` `<=` | `$eq` `$ne` `$gt` `$gte` `$lt` `$lte` | comparison on a normalised value |
| `like` / `notLike` | `LIKE` / `NOT LIKE` | anchored `$regex` / `$not` | anchored `RegExp` |
| `ilike` | `UPPER(col) LIKE UPPER(:bind)` | `$regex` with the `i` flag | case-insensitive `RegExp` |
| `in` / `notIn` | `IN (…)` / `NOT IN (…)` | `$in` / `$nin` | `some` / every |
| `between` | `BETWEEN … AND …` | `$gte` + `$lte` | both bounds |
| `isNull` | `IS NULL` / `IS NOT NULL` | `$eq: null` / `$ne: null` | `null` or absent |
| `$and` `$or` `$not` | nested groups | `$and`, `$or`, `$nor` with one member | recursive evaluation |

Details that are easy to get wrong and are therefore fixed by the contract suite:

- A bare `null` (`{ tag: null }`) means `IS NULL`. On MongoDB it is translated to `$eq: null`, which also matches documents where the field is absent — what a SQL engine understands by "column without a value".
- An **empty list** is not invalid syntax: `in: []` compiles to `1 = 0` and `notIn: []` to `1 = 1` on SQL, and to `$in: []` on MongoDB. Dynamic filters hit this constantly.
- A **property that is not mapped throws** rather than silently matching nothing.
- A `%` or `_` written by the user is escaped before the LIKE pattern becomes a regular expression, so it cannot turn into an arbitrary regex.
- Filters on the same field never collide: the Mongo translator splits them into several documents instead of overwriting a key, and SQL joins them with `AND`.

Three translators keep those semantics aligned — `SqlWhereCompiler`, `toMongoFilter` and `matchesFilter` — and each one resolves field names through `EntitySchema` and values through `toColumnValue`, so a model boolean is compared against the stored `1/0` and a date travels as a `Date`.

---

## Chainable queries and paging

`query()` returns an `IQueryable<T>` that mirrors LINQ: lazy, immutable, and only touching the database on a terminal operator.

```typescript
const page = await appointmentsRepository
  .query()
  .where({ fkBranch: 1 })
  .where({ status: { notIn: ["CANCELLED", "DONE"] } })  // accumulates with AND
  .orderByDescending("scheduledAt")
  .toPagedList(1, 20);

const exists = await branchesRepository.query().where({ name: "Centro" }).any();
```

Composition: `where`, `orderBy`, `orderByDescending`, `select`, `skip`, `take`, `withDeleted`.
Terminal: `toList`, `firstOrDefault`, `count`, `any`, `toPagedList`. `toOptions()` returns the accumulated `QueryOptions` for debugging or reuse.

Each call returns a **new** query, so a base query can be branched without the branches contaminating each other. The builder is a single class shared by all drivers — it knows nothing about SQL or documents, it just accumulates options and delegates the terminal call to the repository that created it. On a module repository the builder points at the module repository itself, so terminal operators also go through the error logging.

`getPaged(page, limit)` clamps both arguments to at least 1 and returns `{ items, total, page, limit, pages }` — one count plus one windowed read. When a paginated query has no `orderBy`, the repository falls back to ordering by the primary key: neither Oracle nor SQL Server guarantees the order of an `OFFSET`/`FETCH` without `ORDER BY` (SQL Server rejects it outright) and MongoDB does not guarantee natural order, so without that fallback two consecutive pages could repeat or skip rows.

---

## Soft delete, restore and hard delete

An entity that declares `softDelete` gets a logical delete: the flag is flipped, the row survives, and reads stop returning it unless asked with `withDeleted`.

```typescript
await branches.softDelete(id);                       // true the first time
await branches.softDelete(id);                       // false — nothing to do
await branches.getById(id);                          // null
await branches.getById(id, { withDeleted: true });   // the row, still there
await branches.restore(id);                          // true, and false if repeated
```

Both operations are **idempotent by construction**: the statement carries a condition on the previous state, so deleting twice returns `false` the second time instead of pretending it did something. Both count as modifications, so they stamp `updatedAt` and `updatedBy`.

`hardDelete` is a real `DELETE`. `hardDeleteWhere` is the bulk version, and it is the one place where the soft-delete filter is deliberately **not** applied: skipping already-flagged rows would leave orphans pointing by foreign key at something that has just disappeared.

Calling `softDelete` or `restore` on an entity whose metadata declares no `softDelete` throws, with a message telling you to use `hardDelete` or add the metadata — better than silently doing nothing.

---

## Transactions (unit of work)

**Not everything is wrapped in a transaction.** A single statement is already atomic and travels with auto-commit; wrapping it would only add a round trip.

A transaction is opened when a use case writes in more than one place and a half-finished result would be invalid. That boundary is the service, not the repository:

```typescript
async hardDelete(id: number): Promise<boolean> {
  return this.unitOfWork.execute(async (scope) => {
    const branches = scope.repository<IBranch>(ENTITY_NAMES.BRANCHES);
    const appointments = scope.repository<IAppointment>(ENTITY_NAMES.APPOINTMENTS);

    // Appointments reference the branch by FK, so they go first.
    const removedAppointments = await appointments.hardDeleteWhere({ fkBranch: id });
    const deleted = await branches.hardDelete(id);

    if (!deleted) {
      throw new AppError("Branch not found", 404);   // triggers the rollback
    }
    return true;
  });
}
```

Inside the block, `scope.repository(...)` returns the same generic repository bound to the transaction, memoised per entity, so the service code is identical to the non-transactional path. Commit on success, rollback on throw, the original error propagated untouched. The change log follows the same scope: a rolled-back operation takes its `AUDIT_LOG` line with it.

How each engine implements it:

| Engine | Implementation |
|--------|----------------|
| Oracle | One pooled connection with `autoCommit: false`, commit or rollback around the block. |
| SQL Server · PostgreSQL · MySQL | Sequelize's managed transaction; the block receives an executor bound to it. |
| MongoDB | A `ClientSession` passed to every operation. `withTransaction` **retries** on transient server errors, so the block may run more than once and must not carry side effects outside the database. |
| In memory | Snapshots every store before running and restores them if the block throws. It reproduces the failure behaviour, not isolation between concurrent operations — that is the database's job. |

---

## Where the generic API stops

### Relations are composed in the service

A repository knows exactly one table. Composing across aggregates is a business decision, so it happens in the **service** layer — the equivalent of EF Core's `Include()`. `loadRelated` (`src/application/queries/include.query.ts`) resolves an N:1 relation in **one batched query** (`WHERE key IN (…)`), not one per row:

```typescript
const branches = await loadRelated<IAppointment, IBranch>(appointments, {
  foreignKey: "fkBranch",
  relatedKey: "pkBranch",
  repository: this.branchesRepository,
});

const branchName = branches.get(appointment.fkBranch)?.name ?? null;
```

Null foreign keys are skipped (optional relation) and nothing is queried when there is nothing to resolve. `withDeleted` defaults to `true` here: an appointment should still display its branch name after the branch has been logically deleted.

### A second interface for extra SQL

Per the project convention, a module gets the generic repository **plus** its own interface only when it needs something the generic API cannot express:

```typescript
// Branches: the generic contract is enough.
export type IBranchesRepository = IGenericRepository<IBranch>;

// Appointments: the generic contract plus a GROUP BY.
export interface IAppointmentsRepository extends IGenericRepository<IAppointment> {
  countByStatus(fkBranch?: number): Promise<AppointmentStatusCount[]>;
}
```

Aggregations are outside the filter language on purpose: adding them would turn it into a full ORM. `SqlGenericRepository.executeRaw()` is the documented escape hatch for them — and for views and stored procedures. Values still travel as binds, and physical names still come from the mapping:

```typescript
const statusColumn = store.schema.columnOf("status");
const rows = await store.executeRaw<{ STATUS: string; TOTAL: number }>(sql, binds);
```

`AppointmentsRepository.countByStatus` is the worked example: it takes that path when the active store is a `SqlGenericRepository` and computes the same result in JavaScript otherwise, so the module keeps working under `DATA_SOURCE=dummy` and `mongodb` without anyone needing Docker to develop it.

---

## The engines

| `DATA_SOURCE` | Engine | Repository | Connector | Container (host port) |
|---------------|--------|------------|-----------|-----------------------|
| `dummy`, `memory` | in-process arrays | `MemoryGenericRepository` | — | — |
| `oracle` | Oracle 23ai Free | `SqlGenericRepository` + `oracleDialect` | `OraclePlugin` — node-oracledb 7, thin mode | `oracle` — 1521 |
| `sqlserver`, `mssql` | SQL Server 2022 | `SqlGenericRepository` + `sqlServerDialect` | `SequelizeDbPlugin` — tedious | `mssql` — 1434 |
| `postgres`, `postgresql` | PostgreSQL 16 | `SqlGenericRepository` + `postgresDialect` | `SequelizeDbPlugin` — pg | `postgres` — 5433 |
| `mysql`, `mariadb` | MySQL 8 | `SqlGenericRepository` + `mysqlDialect` | `SequelizeDbPlugin` — mysql2 | `mysql` — 3307 |
| `mongodb`, `mongo` | MongoDB 7 | `MongoGenericRepository` | `MongoDbPlugin` — mongodb driver | `mongo` — 27017 |

One connector covers three engines because Sequelize speaks all three; what changes between them lives in the dialect. The only thing `SequelizeDbPlugin` resolves per engine is how to ask the driver for two things they do not all report the same way: affected rows and the generated id.

**Non-standard ports are deliberate.** A locally installed SQL Server on 1433, PostgreSQL on 5432 or MySQL on 3306 silently wins over the Docker mapping on `localhost`, and the symptom is a confusing login failure against a database you never configured. Both collisions happened on the machine this was built on.

Sequelize `replacements` are escaped and interpolated, not server-side parameters. Sequelize escapes per dialect so it is safe against injection, but it does not reuse execution plans the way a real bind would. `node-oracledb` does use real binds.

### What a dialect encodes

Only a few things actually differ between the four SQL engines:

| | Generated PK | Server "now" | Pagination |
|---|---|---|---|
| Oracle | `RETURNING … INTO` (out bind) | `SYSTIMESTAMP` | `OFFSET … FETCH NEXT` |
| SQL Server | `OUTPUT INSERTED` | `SYSDATETIME()` | `OFFSET … FETCH NEXT` |
| PostgreSQL | `RETURNING` | `NOW()` | `OFFSET … FETCH NEXT` |
| MySQL / MariaDB | the driver (`LAST_INSERT_ID()`) | `CURRENT_TIMESTAMP(3)` | `LIMIT … OFFSET` |

`OUTPUT INSERTED` is preferred over `SCOPE_IDENTITY()` because it does not depend on session scope. MySQL is the odd one out twice: it has neither `RETURNING` nor `OUTPUT`, and it does not understand `OFFSET … FETCH NEXT` — when only an offset is needed it gets `LIMIT 18446744073709551615`, the trick the MySQL manual itself documents for "from row N to the end".

That first column is why `ISqlExecutor.execute` takes an `expects` hint (`rows` | `affected` | `identity`): the repository knows whether a statement yields a result set, a row count or a generated id, and each connector answers accordingly. Oracle ignores the hint — it returns all three in one response.

### The timezone trap

Sequelize escapes a `Date` as **local time with offset**. SQL Server and MySQL drop that offset when storing it, then read the column back **as if it were UTC**, so every round trip shifted by the local offset. The symptom was subtle: the appointment overlap rule silently stopped detecting clashes, because the comparison on the JavaScript side saw times hours apart.

Both dialects now normalise `Date` binds to UTC without an offset, which is exactly what the read side assumes. Oracle and PostgreSQL don't need it — `node-oracledb` preserves the instant and the PostgreSQL column is `TIMESTAMPTZ`.

If you add another engine, **test a date round trip explicitly**. It is the failure this codebase hit twice.

### Connections

A pooled `connection.close()` returns the connection to the pool; it does not tear down the socket. Every acquisition is paired with a release in a `finally`, so a connection is held only for the statement — except inside a transaction, where one connection is held for the whole block, because a `COMMIT` only makes sense on the session that did the writes. Keep those blocks short.

Pools and clients are created lazily and memoised, so a burst of requests at startup opens exactly one. A failed attempt is not cached: a transient failure — the database still booting, the replica still electing a primary — does not poison the process. The pool lives for the process and is drained on `SIGINT`/`SIGTERM`. `ORACLE_POOL_MIN=0` keeps no idle connections at all.

### The example schema

Schemas and seeds live under `docker/<engine>/`, all mirroring the same three example tables plus `AUDIT_LOG`, with identical table, column and constraint names — the mapping in `entities.ts` is one and the same for every engine, so any divergence would break the generated SQL against one of them.

```
USERS                      BRANCHES                  APPOINTMENTS
─────────────              ─────────────             ──────────────────
PK_USER (identity)         PK_BRANCH (identity)      PK_APPOINTMENT (identity)
NAME                       NAME                      FK_BRANCH    → BRANCHES
EMAIL                      ADDRESS                   FK_CLIENT    → USERS (nullable)
PHONE                      PHONE                     GUEST_NAME   (nullable)
IS_CLIENT                  OPENS_AT  (def. 09:00)    SCHEDULED_AT
AVAILABLE                  CLOSES_AT (def. 18:00)    DURATION_MIN
CREATED_AT / UPDATED_AT    AVAILABLE                 STATUS · DETAILS
CREATED_BY / UPDATED_BY    CREATED_AT / UPDATED_AT   AVAILABLE
                           CREATED_BY / UPDATED_BY   CREATED_AT / UPDATED_AT
                                                     CREATED_BY / UPDATED_BY
```

The convention the generic repository expects is visible there: a numeric identity PK so a generated id can be recovered, an `AVAILABLE` 0/1 flag for the logical delete, and the timestamp and audit columns. An appointment belongs either to a registered client (`FK_CLIENT`) or to someone not registered yet, in which case only the name it was booked under is stored (`GUEST_NAME`); the database enforces that at least one is present:

```sql
CONSTRAINT CK_APPT_PARTY CHECK (FK_CLIENT IS NOT NULL OR GUEST_NAME IS NOT NULL)
```

`STATUS` is restricted to `PENDING | CONFIRMED | DONE | CANCELLED`, `DURATION_MIN` to between 5 and 1440, and `APPOINTMENTS` has foreign keys to both `BRANCHES` and `USERS`.

### In memory (`dummy`)

The default. No Docker, no database: `MemoryGenericRepository` keeps arrays seeded from `seed-data.ts` with the same rows — and therefore the same PKs — as the SQL seeds, so the web UI looks identical with or without a container up. Reads return defensive copies, so a caller cannot mutate the store by holding on to a result.

It is the reference implementation of the contract: if the contract suite passes here, it defines what the other engines have to reproduce. Integration tests run against it (see [testing.md](testing.md)).

### Oracle

```bash
docker compose up -d oracle
docker compose ps oracle          # STATUS should read "(healthy)"
```

The image is `gvenzl/oracle-free:23-slim-faststart` — Oracle Database 23ai Free, community-published, no login required on `container-registry.oracle.com`. The `faststart` variant ships with the database already created, so the first boot takes about a minute instead of ten.

| Setting | Default | Env var |
|---------|---------|---------|
| Port | `1521` | `ORACLE_PORT` |
| Service | `FREEPDB1` | — |
| App user | `appuser` | `ORACLE_USER` |
| App password | `AppPassword1` | `ORACLE_PASSWORD` |
| SYS password | `OraclePassword1` | `ORACLE_SYS_PASSWORD` |

```env
DATA_SOURCE=oracle
ORACLE_PASSWORD=AppPassword1
ORACLE_CONNECT_STRING=localhost:1521/FREEPDB1
```

The API **never** connects as `SYS`. The image creates `APP_USER` inside the PDB with `CONNECT` + `RESOURCE`, which is all the schema needs.

The image runs whatever it finds in `/container-entrypoint-initdb.d` once, on first boot, but does not guarantee which user or container (CDB vs PDB) plain `.sql` files run under. Only a shell script is mounted there:

```
docker/oracle/
├── init/00_init.sh      → mounted at /container-entrypoint-initdb.d
└── sql/
    ├── 01_schema.sql    → mounted at /opt/appsql
    └── 02_seed.sql
```

`00_init.sh` opens `sqlplus` explicitly as `APP_USER` against the PDB and applies every `.sql` in `/opt/appsql`, in order, which makes the target schema deterministic. To reapply it from scratch, drop the volume: `docker compose down -v oracle && docker compose up -d oracle`.

`OraclePlugin` uses **node-oracledb 7 in thin mode**: it speaks the native protocol from Node, so **Oracle Instant Client is not required**. On top of the shared `ISqlExecutor` it adds `execStoredProcedure()`, which follows the usual Oracle convention — the procedure's last parameter must be an `OUT SYS_REFCURSOR`, the only way an Oracle stored procedure returns rows. The pool is drained with a 10-second grace period on shutdown so in-flight queries finish instead of being cut.

Sequence gaps are normal: Oracle identity columns cache sequence values per session (20 by default) and discard the unused ones when the session ends, so after the seed session closes the next insert may jump from 4 to 21. Documented Oracle behaviour, not a bug.

Connecting by hand:

```bash
docker exec -it test-oracle sqlplus appuser/AppPassword1@//localhost:1521/FREEPDB1
```

| Symptom | Cause / fix |
|---------|-------------|
| `ORA-12541: TNS:no listener` | The container is still booting. Wait for `docker compose ps oracle` to report healthy. |
| `ORA-01017: invalid username/password` | `ORACLE_PASSWORD` doesn't match `APP_USER_PASSWORD` in `docker-compose.yml`. |
| `[config] Missing required environment variable(s): ORACLE_PASSWORD` | `DATA_SOURCE=oracle` without the password. Intentional: the app refuses to start with insecure defaults. |
| `ORA-00942: table or view does not exist` | The init scripts didn't run. Check `docker logs test-oracle \| grep "\[init\]"`, then recreate with `docker compose down -v oracle`. |
| `ORA-02292: integrity constraint violated` | Something deleted a branch without clearing its appointments. Go through `BranchesService.hardDelete`, which does both in one transaction. |

### SQL Server

```bash
docker compose up -d mssql        # host port 1434
```

```env
DATA_SOURCE=sqlserver
DB_HOST=localhost
DB_PORT=1434
DB_USER=sa
DB_PASSWORD=StrongPassword123!
DB_NAME=testdb
```

SQL Server is the one engine whose schema is not applied on first boot: its image has no `initdb.d` hook, so `docker/sqlserver/sql/01_schema.sql` and `02_seed.sql` have to be run by hand with any client once the container is up. The script creates `testdb` only if it is missing, so it can be re-applied against an instance that already has it.

SQL Server also does not report affected rows in its response, so the connector appends `SELECT @@ROWCOUNT` to writes and reads it back as a result set.

### PostgreSQL

```bash
docker compose up -d postgres     # host port 5433
```

```env
DATA_SOURCE=postgres
POSTGRES_PORT=5433
POSTGRES_USER=appuser
POSTGRES_PASSWORD=AppPassword1
POSTGRES_DB=testdb
```

**PostgreSQL folds unquoted identifiers to lowercase**, in the DDL exactly as in queries. The schema is therefore created without quotes, so the uppercase SQL the repository generates folds to the very same names and resolves; column-to-property mapping is case-insensitive, so results coming back lowercased map back cleanly. Quoting the DDL is precisely what would break it.

The official image guarantees which user and database its `initdb.d` scripts run under and applies them in alphabetical order, so no intermediate script is needed.

### MySQL / MariaDB

```bash
docker compose up -d mysql        # host port 3307
```

```env
DATA_SOURCE=mysql                 # "mariadb" resolves to the same driver
MYSQL_PORT=3307
MYSQL_USER=appuser
MYSQL_PASSWORD=AppPassword1
MYSQL_DB=testdb
```

Tables are InnoDB and utf8mb4: InnoDB because it is the only engine with foreign keys and transactions, both of which the repository uses, and utf8mb4 because the historical `utf8` covers only three bytes per character and the seed has accents.

Sequelize has no `executeMany`, so `insertMany` repeats the statement inside a transaction — either every row lands or none does, which is the guarantee Oracle's bulk insert gives.

### MongoDB

```bash
docker compose up -d mongo        # host port 27017, single-node replica set
```

```env
DATA_SOURCE=mongodb
MONGO_HOST=localhost
MONGO_PORT=27017
MONGO_DB=testdb
MONGO_USER=                       # the development container runs without auth
MONGO_PASSWORD=
```

MongoDB is the only engine that shares no implementation with any other. It offers exactly the same contract, and `docker/mongo/init/01-init.js` is the twin of the SQL schema and seed: each `$jsonSchema` validator reproduces what the tables express as types, `NOT NULL` and `CHECK`. Field names are uppercase (`PK_USER`, `NAME`, …) because the mapping in `entities.ts` is shared with the SQL engines; lowercase field names would make the repository read empty documents. Flags are numeric `0/1` rather than booleans for the same reason.

It is also the only engine whose credentials are not demanded at startup: the development container runs without authentication, so requiring `MONGO_PASSWORD` would block the normal case. The other four fail fast when their password is missing.

Four divergences are real and worth knowing:

- **Transactions require a replica set.** The container runs `mongod --replSet rs0` and `01-init.js` performs the `rs.initiate()`. A standalone `mongod` has no oplog and rejects `startTransaction`, and since the repository writes each operation and its `AUDIT_LOG` line atomically, the API would not work at all. The health check waits on `rs.status()`, so "healthy" means "replica ready", not merely "port open".
- **Numeric primary keys come from a `_counters` collection** — the canonical sequence pattern, one document per entity, incremented with an atomic `findOneAndUpdate`. The reservation deliberately happens **outside** the transaction's session: two transactions touching the same counter document would conflict and one would abort, and a sequence that does not give the number back on rollback is exactly how Oracle sequences and SQL Server `IDENTITY` behave. **Gaps are therefore possible, and that is the faithful behaviour.** A brand-new counter starts above the highest existing PK, because the seed inserts 1..4 directly without going through it.
- **Timestamps are written by the application.** MongoDB has no server-side equivalent of `SYSTIMESTAMP` that is evaluated on write, so `CREATED_AT` / `UPDATED_AT` come from the Node process clock instead of the database's.
- **A `$jsonSchema` validator rejects documents, it does not complete them.** Everything the SQL engines fill in with a column `DEFAULT` has to be written by the repository — the soft-delete flag, the timestamps, the audit columns. The one case that cannot be reproduced is a default the application does not supply: `OPENS_AT` and `CLOSES_AT` are `NOT NULL DEFAULT '09:00' / '18:00'` in SQL, so a branch created without a schedule gets those values there, while on MongoDB it simply comes back without them. That is why they are left out of `required` — demanding them would reject an insert the other four engines accept.

MongoDB also has no foreign keys, so the existence of the referenced branch and client is checked by the application rather than the database. `_id` is excluded from every projection: it is Mongo's technical key, not part of the domain model, and it has no counterpart in the other engines.

---

## Adding a new engine

If it is SQL and Sequelize speaks it, it is a dialect plus three lines of wiring:

1. Add the dialect in `base/dialects/sql.dialect.ts` — how a generated PK comes back, the server's now expression, the pagination clause, and any bind conversion the driver needs.
2. Add it to `SEQUELIZE_DEFAULTS` and `SEQUELIZE_DIALECTS` in `core/di/repository.factory.ts`, and to `SequelizeEngine`.
3. Add the alias in `DRIVER_ALIASES`, the variables in `.env.template`, the password check in `core/config/env.validation.ts`, and the schema in `docker/<engine>/`.

If it is not SQL, it needs its own `IGenericRepository<T>` implementation, its own filter translator and its own unit of work — that is what MongoDB has. `MemoryGenericRepository` is the reference: it implements the same contract with no SQL at all.

Either way:

- Point the **contract suite** at it (`tests/contract/generic-repository.contract.ts`) before anything else. It is the definition of "behaves like the others", and it is cheaper to satisfy than to retrofit.
- **Test a date round trip explicitly**, for the reason described above.
- **Do not add it to `DRIVER_ALIASES` before the implementation exists.** Listing it early makes `DATA_SOURCE` boot in memory and hide the problem, which is the one thing that table is there to prevent.

Related reading: [architecture.md](architecture.md) for where this layer sits, [add-new-module.md](add-new-module.md) for adding an entity on top of it, [getting-started.md](getting-started.md) to get a database running.
