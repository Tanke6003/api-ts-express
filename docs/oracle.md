# Oracle Integration

How to run the API against a real Oracle database, what the schema looks like, and how the driver is wired.

---

## 1. Start the database

```bash
docker compose up -d oracle
```

The `oracle` service uses **`gvenzl/oracle-free:23-slim-faststart`** — Oracle Database 23ai Free, community-published, no login required on `container-registry.oracle.com`. The `faststart` variant ships with the database already created, so the first boot takes about a minute instead of ten.

Wait until it reports healthy:

```bash
docker compose ps oracle          # STATUS should read "(healthy)"
docker logs test-oracle | grep "DATABASE IS READY"
```

| Setting | Default | Env var |
|---------|---------|---------|
| Port | `1521` | `ORACLE_PORT` |
| Service | `FREEPDB1` | — |
| App user | `appuser` | `ORACLE_USER` |
| App password | `AppPassword1` | `ORACLE_PASSWORD` |
| SYS password | `OraclePassword1` | `ORACLE_SYS_PASSWORD` |

The API **never** connects as `SYS`. The image creates `APP_USER` inside the PDB with `CONNECT` + `RESOURCE`, which is all the schema needs.

### How the schema gets created

The image runs anything it finds in `/container-entrypoint-initdb.d` once, on first boot. It does not guarantee which user or container (CDB vs PDB) plain `.sql` files run under, so only a shell script is mounted there:

```
docker/oracle/
├── init/00_init.sh      → mounted at /container-entrypoint-initdb.d
└── sql/
    ├── 01_schema.sql    → mounted at /opt/appsql
    └── 02_seed.sql
```

`00_init.sh` opens `sqlplus` explicitly as `APP_USER` against the PDB and applies every `.sql` in `/opt/appsql`, in order. That makes the target schema deterministic.

To reapply the schema from scratch, drop the volume:

```bash
docker compose down -v oracle && docker compose up -d oracle
```

---

## 2. Point the API at Oracle

```env
DATA_SOURCE=oracle
ORACLE_USER=appuser
ORACLE_PASSWORD=AppPassword1
ORACLE_CONNECT_STRING=localhost:1521/FREEPDB1
```

`ORACLE_PASSWORD` is a required secret when `DATA_SOURCE=oracle`; the app refuses to start without it. Then:

```bash
npm run dev:win        # Windows
npm run dev            # Linux / macOS
```

On startup the pool is opened and verified before the server accepts traffic, so bad credentials show up in the boot log rather than on a user's first request:

```
INFO: Oracle pool creado {"connectString":"localhost:1521/FREEPDB1","user":"appuser"}
INFO: Conexión con Oracle establecida correctamente.
```

`GET /health` reports the active driver (`"dataSource":"oracle"`), and the web UI shows it as a badge.

---

## 3. The driver

`OraclePlugin` (`src/infrastructure/plugins/oracle.plugin.ts`) wraps **node-oracledb 7 in thin mode** — it speaks the native protocol from Node, so **Oracle Instant Client is not required**.

- The pool is created lazily and memoized, so a burst of requests at startup opens exactly one pool. A failed attempt is not cached, so a transient failure (database still booting) doesn't poison the process.
- `execute()` runs with `autoCommit: true`; `transaction()` takes one connection with `autoCommit: false` and commits or rolls back around the block.
- `execStoredProcedure()` follows the usual Oracle convention: the procedure's last parameter must be an `OUT SYS_REFCURSOR`.
- `close()` drains the pool (10 s) on `SIGINT`/`SIGTERM`.

It implements the project's `ISqlConnectionPlugin`, so it coexists with `SequelizePlugin` in the DI container.

---

## 4. Schema

Three tables sharing the convention the generic repository expects: numeric `IDENTITY` PK, an `AVAILABLE NUMBER(1)` soft-delete flag, and `CREATED_AT` / `UPDATED_AT` timestamps.

```
USERS                      BRANCHES                  APPOINTMENTS
─────────────              ─────────────             ──────────────────
PK_USER (identity)         PK_BRANCH (identity)      PK_APPOINTMENT (identity)
NAME                       NAME                      FK_BRANCH    → BRANCHES
EMAIL                      ADDRESS                   FK_CLIENT    → USERS (nullable)
PHONE                      PHONE                     GUEST_NAME   (nullable)
IS_CLIENT                  OPENS_AT                  SCHEDULED_AT
AVAILABLE                  CLOSES_AT                 DURATION_MIN
CREATED_AT                 AVAILABLE                 STATUS
UPDATED_AT                 CREATED_AT                DETAILS
                           UPDATED_AT                AVAILABLE
                                                     CREATED_AT / UPDATED_AT
```

An appointment belongs either to a registered client (`FK_CLIENT`) or to someone who is not registered yet, in which case only the name it was booked under is stored (`GUEST_NAME`). The database enforces that at least one is present:

```sql
CONSTRAINT CK_APPT_PARTY CHECK (FK_CLIENT IS NOT NULL OR GUEST_NAME IS NOT NULL)
```

Other guarantees in the schema: `STATUS` restricted to `PENDING | CONFIRMED | DONE | CANCELLED`, `DURATION_MIN` between 5 and 1440, and foreign keys from `APPOINTMENTS` to both `BRANCHES` and `USERS`.

> **Sequence gaps are normal.** Oracle `IDENTITY` columns cache sequence values per session (20 by default), and unused values are discarded when the session ends. After the seed session closes, the next insert may jump from 4 to 21. That is documented Oracle behaviour, not a bug.

---

## 5. Connecting by hand

```bash
docker exec -it test-oracle sqlplus appuser/AppPassword1@//localhost:1521/FREEPDB1
```

```sql
SELECT table_name FROM user_tables;
SELECT STATUS, COUNT(*) FROM APPOINTMENTS WHERE AVAILABLE = 1 GROUP BY STATUS;
```

---

## 6. Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| `ORA-12541: TNS:no listener` | The container is still booting. Wait for `docker compose ps oracle` to report healthy. |
| `ORA-01017: invalid username/password` | `ORACLE_PASSWORD` doesn't match `APP_USER_PASSWORD` in `docker-compose.yml`. |
| `[config] Missing required environment variable(s): ORACLE_PASSWORD` | `DATA_SOURCE=oracle` without the password. Intentional: the app refuses to start with insecure defaults. |
| `ORA-00942: table or view does not exist` | The init scripts didn't run. Check `docker logs test-oracle \| grep "\[init\]"`, then recreate with `docker compose down -v oracle`. |
| `ORA-02292: integrity constraint violated` | Something deleted a branch without clearing its appointments. Go through `BranchesService.hardDelete`, which does both in one transaction. |
