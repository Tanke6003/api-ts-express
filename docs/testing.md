# Testing Guide

This project uses **Jest** with **ts-jest** for TypeScript support. Tests are split into three categories: unit, integration, and e2e.

---

## Running tests

| Command | Description |
|---------|-------------|
| `npm test` | Run unit + integration tests with coverage |
| `npm run test:watch` | Watch mode — re-runs on file changes |
| `npm run test:local` | Full run with HTML + LCOV + JSON reports |
| `npm run test:repo` | CI-friendly run (text-summary only) |

Reports are written to `reports/`:

```
reports/
├── coverage/         # HTML, LCOV, JSON coverage
│   ├── index.html    # Open in browser
│   └── lcov.info
└── tests-report.html # Jest HTML test report
```

---

## Test types

### Unit tests (`tests/unit/`)

Test a single class in isolation. All dependencies are mocked.

- No network, no database, no filesystem
- Fast — milliseconds per file
- High coverage requirement (90 %+ functions/lines in application and presentation layers)

### Integration tests (`tests/integration/`)

Test the full HTTP stack using [supertest](https://github.com/ladjs/supertest).

- Boot the Express app against the **DummyDataSource** (no external DB needed)
- Verify HTTP status codes, response bodies, and auth middleware
- Run with `npm test` (included in default `testMatch`)

### E2E tests (`tests/e2e/`) — disabled by default

End-to-end tests run against a real environment (real DB, real services). They are commented out in `jest.config.js`. Enable them when you have a full environment configured.

---

## Coverage thresholds

Defined in `jest.config.js` per layer:

| Layer | Branches | Functions | Lines | Statements |
|-------|----------|-----------|-------|------------|
| `src/application/` | 85 % | 90 % | 90 % | 90 % |
| `src/infrastructure/` | 70 % | 90 % | 90 % | 90 % |
| `src/presentation/` | 80 % | 90 % | 90 % | 90 % |

If any threshold is not met, `npm test` exits with a non-zero code and CI fails.

---

## Writing unit tests

### Service test pattern

```typescript
// tests/unit/services/products.service.unit.test.ts
import "reflect-metadata";
import { ProductsService } from "../../../src/application/services/products.service";
import { IProductsRepository } from "../../../src/domain/interfaces/infrastructure/repositories/products.repository.interface";

const mockRepository: jest.Mocked<IProductsRepository> = {
  getAllProducts: jest.fn(),
  getProductById: jest.fn(),
  createProduct: jest.fn(),
  updateProduct: jest.fn(),
  deleteProduct: jest.fn(),
};

describe("ProductsService", () => {
  let service: ProductsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ProductsService(mockRepository);
  });

  it("should return all products as DTOs", async () => {
    mockRepository.getAllProducts.mockResolvedValue([
      { pkProduct: 1, name: "Widget", price: 9.99, available: true },
    ]);

    const result = await service.getAllProducts();

    expect(result).toEqual([{ id: 1, name: "Widget", price: 9.99 }]);
  });
});
```

### Controller test pattern

```typescript
// tests/unit/controllers/products.controller.unit.test.ts
import { ProductsController } from "../../../src/presentation/controllers/products.controller";
import { IProductsService } from "../../../src/domain/interfaces/application/services/products.service.interface";

describe("ProductsController", () => {
  let mockService: jest.Mocked<IProductsService>;
  let controller: ProductsController;
  let mockReq: any;
  let mockRes: any;

  beforeEach(() => {
    mockService = {
      getAllProducts: jest.fn(),
      getProductById: jest.fn(),
      createProduct: jest.fn(),
      updateProduct: jest.fn(),
      deleteProduct: jest.fn(),
    };

    controller = new ProductsController(mockService);

    mockReq = { params: {}, body: {} };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
    };
  });

  it("should return 200 with all products", async () => {
    mockService.getAllProducts.mockResolvedValue([{ id: 1, name: "Widget", price: 9.99 }]);

    await controller.getAllProducts(mockReq, mockRes);

    expect(mockRes.json).toHaveBeenCalledWith([{ id: 1, name: "Widget", price: 9.99 }]);
  });

  it("should return 500 on service error", async () => {
    mockService.getAllProducts.mockRejectedValue(new Error("DB down"));

    await controller.getAllProducts(mockReq, mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(500);
  });
});
```

---

## Writing integration tests

Integration tests start the Express app (using DI container + DummyDataSource) and fire HTTP requests.

```typescript
// tests/integration/products.integration.test.ts
import "reflect-metadata";
import "../../src/core/di/container";
import request from "supertest";
import { Server } from "../../src/core/server";
import { container } from "tsyringe";
import { IEnvs } from "../../src/domain/interfaces/infrastructure/plugins/envs.plugin.interface";

let app: any;

beforeAll(async () => {
  const envs = container.resolve<IEnvs>("IEnvs");
  const server = new Server(Number(envs.getEnv("PORT") || 4002));
  await server.configureMiddleware();
  await server.configureRoutes();
  app = server.app;
});

describe("GET /api/products", () => {
  it("returns 200 with an array", async () => {
    const res = await request(app).get("/api/products");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
```

---

## Mocking the DI container

When the container is not needed, pass dependencies directly to the constructor — `@injectable` classes accept constructor injection without the container:

```typescript
// No container needed
const mockRepo = { getAllProducts: jest.fn(), ... };
const service = new ProductsService(mockRepo);
```

For server-level tests that need the container, reset and re-register:

```typescript
beforeEach(() => {
  container.reset();
  container.register("ILogger", { useValue: mockLogger });
  // register other needed tokens...
});
```

---

## Test file naming

| Test type | Pattern |
|-----------|---------|
| Unit | `tests/unit/<layer>/<name>.unit.test.ts` |
| Integration | `tests/integration/<name>.integration.test.ts` |
| E2E | `tests/e2e/<name>.e2e.test.ts` |

---

## Debugging tests in VS Code

The `.vscode/launch.json` includes configurations for:

- **Jest — Run all** — run all tests
- **Jest — Watch** — watch mode
- **Jest — Coverage** — run with coverage

Select one from the Run & Debug panel (`Ctrl+Shift+D`).
