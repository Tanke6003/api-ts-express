# Changelog

## Unreleased — `feature/http-hardening`

**HTTP hardening.** Helmet, per-IP rate limiting, CORS against an allowlist read
from `CORS_ORIGINS`, body capped at 1 MB, `x-powered-by` off, and Swagger,
Scalar and `openapi.json` published everywhere except production.

**Double-booking race closed.** `ITransactionScope.lockRow` plus
`SqlDialect.buildRowLock` per engine; the appointment check and write now happen
inside one transaction that locks the branch row. Unique index on the five
schemas as the backstop for when more than one instance runs, and the violation
is translated back into the overlap 409.

**Graceful shutdown and real health probes.** The HTTP server is kept so it can
be closed, and shutdown drains in four steps with a watchdog. `/health/live`
never touches the database, `/health/ready` answers 503 when it is down or while
draining, `/health` stays as an alias.

**Routing declared on the controller.** `@ApiController` and the verb decorators
replaced all six route files. One declaration produces the Express route, the
Zod validation and the OpenAPI operation, so they cannot disagree. The whole
document is generated — including the DTO components, declared once with
`defineDto` — and swagger-jsdoc is gone, which also fixes docs being empty in
production. Now OpenAPI 3.1.

**API prefix configurable** through `API_PREFIX` (`/api/v1` by default), with the
unversioned `/api` kept as an alias and the prefix published on `/health/ready`.

**`contains` filter operator.** User input is no longer a LIKE pattern: searching
`%` returned the whole table, and on MongoDB it built a pathological regex.

**Uploads.** 5 MB per file, one file on `/upload-file` and ten on
`/upload-files`, a wrong body answers 400 instead of 500, and busboy's error
event is handled so a malformed multipart cannot take the process down. MinIO
now actually starts — the compose service had no `command` — and a `minio-init`
companion creates the bucket.

---

## Commit log

* [Update] implement tests (257320b)
* [Add] add test to users sql server datasource (f9a3902)
* [Update] add test to jwt and sequelize (e62451f)
* [Add] add keep to test folders (2995896)
* [Fix] Update package-lock to lint workflow (f578005)
* [Add] add lint workflow (d9da64d)
* [Add] add lint to better coding styles (773d94c)
* remove reports (6abf30b)
* Ignorar carpeta reports (031fdd6)
* [UPDATE] add isolatedModules to fix warning (71bc8cc)
* Merge pull request #4 from Tanke6003/feature/add-test (b67da9d)
* [Update] comment coverage threshold because not all the tests are been implemented (7111e94)
* [Add] add jest and coverage reports and some test of plugins like envs and wiston (cd05e80)
* Merge pull request #3 from Tanke6003/feature/add-dependency-injection (fc48495)
* remove vercel (fc733e2)
* [UPDATE] add dependency Injection (78d4f6b)
* better readme and .envs (33553dc)
* Update issue templates (eff4350)
* [ADD] add middleware http log (b977538)
* [Add] add middleware JWT plugin (c0005c5)
* docs (643b059)
* [Add] swagger-ui-dist (97f02e8)
* app (f7ba76f)
* remove log (51b08ca)
* [Fix] comprobate app (0be5bae)
* add comand vercel (3de9798)
* [Fix] vercel deploy (042e667)
* t (a1c6756)
* [fix] replace vercel js (96122a1)
* [Test] vercel config (2a7fa03)
* [Fix] implements user datasource on dummy datasource (ce3be65)
* Merge pull request #2 from Tanke6003/add-mssqldb (fc565ed)
* [Add] implements sequelize with tedious and mssql (23c869c)
* [FIX] update log path to fix build (7b23f8c)
* [Add] add health checker api endpoint (a59580c)
* [Add] add healt checker api endpoint (538787e)
* [Add] configure wiston like plugin to logger (93b476e)
* [UPDATE] update readme (e0542ab)
* Merge pull request #1 from Tanke6003/feature/add-envs (95436c1)
* [Add] Readme (da304cc)
* [Add] add details to documentation api (e7a89a0)
* and envs plugin (c88b58a)
* [Fix] fix merge conflicts others (447abd5)
* Merge branch 'feature/add-swagger' into feature/add-scalar (f29da5f)
* [Add] configure Scalar config (bdab93a)
* [Add] swagger configured (bd3779f)
* [Add] basic example structure (c88d7b6)
* first commit (a5b2641)