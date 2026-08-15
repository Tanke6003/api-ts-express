# Testing

Jest with ts-jest. Everything runs against the in-memory driver, so `npm test`
needs no Docker and no database — the suite is the same in CI and on a laptop.

## What gets a test, and where

There are two levels, and the line between them is **where the logic lives**.

| Level | Covers |
|-------|--------|
| `unit` | The shared machinery — generic CRUD, routing and decorators, base repository, dialects, filters, unit of work, error mapping — and a module's **own business rules** |
| `e2e`  | Each entity's flow over HTTP, route to database |

**A module without rules of its own gets no unit test.** Users declares no
behaviour: its service and controller come from `CrudService` and
`CrudController`, which have their own tests. Writing `users.controller.unit.test`
would be testing the framework through something that adds nothing to it, and it
would break every time the framework changed shape without a single bug being
caught.

**A module with rules keeps its unit tests, and they are the important ones.**
The appointment overlap has a dozen edge cases — the exact boundary, cancelled
ones excluded, the appointment itself excluded when rescheduling — and setting
each of those up over HTTP is slow, verbose and fragile. They belong in
`appointments.service.unit.test.ts`.

What an e2e adds that a unit test cannot: that the wiring holds. Route mounted,
guard in place, validation applied, error envelope shaped, status codes right.
One flow per entity is enough for that; it does not need to enumerate cases.

The evidence this works: dropping the three per-entity ceremony suites —365
lines asserting what the generic pieces already assert— moved total coverage by
about one point, because the e2e was already exercising the same code.

---

## Running

| Command | Description |
|---------|-------------|
| `npm test` | Unit + e2e, with coverage. What CI runs |
| `npm run test:watch` | Watch mode, re-runs on change |
| `npm run test:local` | Adds HTML + LCOV + JSON reports under `reports/` |
| `npm run test:repo` | Text summary only, for CI logs |

```
reports/
├── coverage/index.html   # open in a browser
├── coverage/lcov.info
└── tests-report.html
```

---

## Layout

```
tests/
├── unit/            # Mirrors src/ one to one
│   ├── application/     services, transactions, mapping, queries, validators
│   ├── core/            config, di, errors, server
│   ├── infrastructure/  plugins, repositories (+ base/)
│   └── presentation/    controllers, middlewares, routing, utils
├── e2e/             # One file per entity, plus the cross-cutting ones
│   ├── support/api.ts   bootstrap() — mounts the API and mints a token
│   ├── users.e2e.test.ts
│   ├── branches.e2e.test.ts
│   ├── appointments.e2e.test.ts
│   ├── audit.e2e.test.ts
│   ├── identity.e2e.test.ts
│   ├── dev.e2e.test.ts
│   └── errors.e2e.test.ts   the error envelope, which belongs to no module
├── contract/        # The suite every repository driver must pass
├── mocks/           # Shared doubles
└── setup/           # test-env.ts — env vars the suite runs with
```

`unit/` mirrors `src/` so a test is where you would look for it. It used to have
three folders for the presentation layer —`controllers/`, `routes/`,
`presentation/`— and two for the application one, which meant guessing.

The e2e share `support/api.ts`: it mounts the whole application over the
in-memory driver and returns the app plus a token. It never calls `run()`, so
nothing listens on a port and two suites can run at once without colliding.

`testMatch` picks up `tests/unit/**` and `tests/e2e/**`. Both run on every
`npm test`: the e2e uses the in-memory driver over supertest, so it needs
nothing running.

`tests/contract/` holds no test files of its own — it exports a function that a driver's test calls, which is why it has no `.test.ts` suffix.

---

## What counts as coverage

`collectCoverageFrom` excludes only what has **no code to execute**: `.d.ts` and
`.interface.ts`, which compile away.

Everything else counts even without a test, and shows up at 0 %. It used to skip
`config/`, the barrels, the DI container and `main.ts`, and that did not raise
quality — it hid the startup, the shutdown and the security policy, which is
exactly the code whose failures nobody sees until production. Widening it moved
the reported number from 94.6 % to 93.0 % and surfaced one real gap:
`sequelize-db.plugin.ts`, the connector behind three of the six engines, sits
under 10 %.

## Coverage thresholds

Enforced per layer in `jest.config.js`. A module without tests fails the build, not just the report:

| Layer | Branches | Functions | Lines | Statements |
|-------|----------|-----------|-------|------------|
| `src/application/` | 85 % | 90 % | 90 % | 90 % |
| `src/infrastructure/` | 65 % | 88 % | 88 % | 88 % |
| `src/presentation/` | 80 % | 90 % | 90 % | 90 % |

Interfaces, `main.ts`, the config files and the composition root are excluded from the count: they are declarations or wiring, and covering them measures nothing.

---

## The driver contract

The promise of this template is that a module written once behaves the same on every engine. That promise is checked, not asserted in a README: `tests/contract/generic-repository.contract.ts` is a single set of assertions — inserts, filters, ordering, paging, projection, soft and hard delete, restore — that **every** implementation of `IGenericRepository<T>` has to pass.

```typescript
// tests/unit/infrastructure/repositories/base/mongo.contract.unit.test.ts
runGenericRepositoryContract("mongodb", {
  create: () =>
    new MongoGenericRepository<ContractItem>(new FakeMongoDataSource(), CONTRACT_ENTITY, silentLogger),
});
```

The entity the suite uses lives in the contract file itself, so each driver imports it without dragging in another driver's test. Add a driver, run the contract against it, and any divergence shows up as a failing assertion instead of as a bug in production.

Whatever is specific to one engine — the SQL it generates, how it reads back a generated id — belongs in that driver's own test, not in the contract.

---

## Unit tests

Doubles are plain objects. The classes are `@injectable()` but they take ordinary constructor parameters, so a unit test never needs the container.

### Controller

Controllers delegate, map to a status code, and hand errors to `next` — the global handler builds the response, so a controller test asserts `next` was called, never a 500 body:

```typescript
service = { getAll: jest.fn(), getById: jest.fn(), create: jest.fn() /* … */ };
controller = new BranchesController(service);

it("pasa la query ya validada al servicio", async () => {
  service.getAll.mockResolvedValue(page);

  await controller.getAll({ validatedQuery: { page: 2, limit: 5 } } as never, res, next);

  expect(service.getAll).toHaveBeenCalledWith({ page: 2, limit: 5 });
  expect(res.json).toHaveBeenCalledWith(page);
});
```

### Service

Services hold the business rules, so their tests are where the interesting assertions live: filters, `Include`, conflicts, and what happens inside a transaction. Double the unit of work by running the callback with scoped doubles, and assert the service asked for the right repositories:

```typescript
unitOfWork = { execute: jest.fn((work) => work({ /* scoped repositories */ })) };
```

When a mock would be more work than the real thing, use `MemoryGenericRepository` as an actual store — it passes the same contract as the engines, so it is a faithful stand-in.

### Repository

Per-module repositories mostly forward to the generic one. Test what they add: the extra SQL and its fallback for the drivers that are not SQL. `tests/unit/repositories/appointments.repository.unit.test.ts` is the worked example.

---

## Integration tests

They boot the real Express app over the in-memory driver and drive it through HTTP. This is where the things that only exist once the layers are assembled get checked: the error envelope, the request id, the audit trail, the transaction that spans two tables.

```typescript
import "reflect-metadata";
import request from "supertest";
import { Server } from "../../src/core/server";
// Importarlo registra todo el contenedor, y de paso reexporta TOKENS.
import { container, TOKENS } from "../../src/core/di/container";

beforeAll(async () => {
  const envs = container.resolve<IEnvs>(TOKENS.IEnvs);
  const server = new Server(Number(envs.getEnv("PORT") || 4002));
  await server.configureMiddleware();
  await server.configureRoutes();
  server.configureErrorHandling();   // last, or it never sees the errors
  app = server.app;

  const { body } = await request(app).get("/api/generate-token?userId=7&name=Ruben");
  auth = `Bearer ${body.token}`;
});
```

`configureErrorHandling()` goes after the routes on purpose: an error middleware registered earlier never runs. Getting that order wrong in a test is the fastest way to end up asserting Express's default HTML error page.

---

## The container in tests

Prefer passing dependencies to the constructor. When a test really needs the container — server-level tests that resolve controllers — reset it and register only what that test needs, always through `TOKENS`:

```typescript
beforeEach(() => {
  container.reset();
  container.register(TOKENS.ILogger, { useValue: mockLogger });
  container.registerSingleton(TOKENS.IRequestContext, AsyncRequestContextPlugin);
});
```

Importing `src/core/di/container` registers everything as a side effect, which is what the integration tests want and what a focused unit test does not.

---

## Naming

| Kind | Pattern |
|------|---------|
| Unit | `tests/unit/<layer>/<name>.unit.test.ts` |
| Integration | `tests/integration/<name>.integration.test.ts` |
| Contract | `tests/unit/**/<driver>.contract.unit.test.ts` |
| E2E | `tests/e2e/<name>.e2e.test.ts` |

---

## Debugging

`.vscode/launch.json` ships with **Jest — Run all**, **Jest — Watch** and **Jest — Coverage**. Pick one from the Run & Debug panel (`Ctrl+Shift+D`).

What each new module owes the suite is listed at the end of **[add-new-module.md](add-new-module.md)**.
