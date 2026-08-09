# Adding a New Module

This guide shows how to add a complete CRUD resource on top of the **generic repository** — no SQL, no hand-written datasource. We use `Products` as the example. The `Branches` module in this repo is the same thing, end to end, if you prefer reading finished code.

Read **[generic-repository.md](generic-repository.md)** first if you haven't; this guide assumes its vocabulary.

---

## Overview

Create the files in this order (inner layers first):

1. Domain model & entity name
2. Entity mapping (+ seed for the in-memory mode)
3. Repository contract & implementation
4. DTOs
5. Zod validators
6. Service (business rules)
7. Controller
8. Routes
9. DI registration
10. Tests

Steps 1–3 contain no SQL at all.

---

## Step 1 — Domain model

`src/domain/models/products.model.ts`

```typescript
export interface IProduct {
  pkProduct: number;
  name: string;
  price: number;
  available?: boolean;      // borrado lógico
  createdAt?: Date | null;
  updatedAt?: Date | null;
}
```

Add the logical name in `src/domain/models/entity-names.ts` so the unit of work can address it:

```typescript
export const ENTITY_NAMES = {
  USERS: "USERS",
  BRANCHES: "BRANCHES",
  APPOINTMENTS: "APPOINTMENTS",
  PRODUCTS: "PRODUCTS",
} as const;
```

---

## Step 2 — Entity mapping

`src/infrastructure/repositories/entities.ts` — the only place column names appear:

```typescript
export const PRODUCTS_ENTITY = defineEntity<IProduct>({
  table: ENTITY_NAMES.PRODUCTS,
  primaryKey: "pkProduct",
  identity: true,
  columns: {
    pkProduct: { name: "PK_PRODUCT", kind: "number", insertable: false, updatable: false },
    name:      { name: "NAME",       kind: "string" },
    price:     { name: "PRICE",      kind: "number" },
    available: { name: "AVAILABLE",  kind: "boolean" },
    createdAt: { name: "CREATED_AT", kind: "date", updatable: false },
    updatedAt: { name: "UPDATED_AT", kind: "date" },
  },
  softDelete: { property: "available", activeValue: 1, deletedValue: 0 },
  timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
});
```

TypeScript requires every property of `IProduct` to appear in `columns`.

Add sample rows for the in-memory mode in `src/infrastructure/repositories/seed-data.ts`, and the table in `docker/oracle/sql/01_schema.sql` following the same convention (identity PK, `AVAILABLE NUMBER(1)`, `CREATED_AT` / `UPDATED_AT`).

---

## Step 3 — Repository

### Contract

`src/domain/interfaces/infrastructure/repositories/products.repository.interface.ts`

```typescript
import { IProduct } from "../../../models/products.model";
import { IGenericRepository } from "./generic.repository.interface";

// El genérico ya cubre todo el CRUD: sólo se fija el tipo de la entidad.
export type IProductsRepository = IGenericRepository<IProduct>;
```

If the module later needs something the generic API can't express (a `GROUP BY`, a view, a stored procedure), **add a second interface that extends it** rather than dropping the generic one:

```typescript
export interface IProductsRepository extends IGenericRepository<IProduct> {
  totalStockByCategory(): Promise<{ category: string; total: number }[]>;
}
```

### Implementation

`src/infrastructure/repositories/products.repository.ts`

```typescript
@injectable()
export class ProductsRepository
  extends BaseModuleRepository<IProduct>
  implements IProductsRepository
{
  constructor(
    @inject("ProductsStore") store: IGenericRepository<IProduct>,
    @inject("ILogger") logger: ILogger
  ) {
    super(store, logger, "ProductsRepository");
  }
}
```

`BaseModuleRepository` forwards every generic method and adds the error logging, so there is no per-method `try/catch`. For extra SQL, use `OracleGenericRepository.executeRaw()` — `AppointmentsRepository.countByStatus` is the worked example, including the in-memory fallback.

---

## Step 4 — DTOs

`src/application/dtos/products.dtos.ts`. Annotate with `@openapi` so the schema shows up in Swagger:

```typescript
/**
 * @openapi
 * components:
 *   schemas:
 *     Product:
 *       type: object
 *       properties:
 *         id: { type: integer, example: 1 }
 *         name: { type: string, example: Teclado }
 *         price: { type: number, example: 499.9 }
 */
export interface ProductDTO {
  id: number;
  name: string;
  price: number;
  available?: boolean;
}

export interface CreateProductDTO {
  name: string;
  price: number;
}

export type UpdateProductDTO = Partial<CreateProductDTO>;

export interface ProductQueryDTO {
  page: number;
  limit: number;
  search?: string;
  withDeleted?: boolean;
}
```

`PaginationDTO` and `PaginatedDTO<T>` are shared — import them from `application/dtos/common.dtos`.

---

## Step 5 — Validators

`src/application/validators/products.validators.ts`

```typescript
export const createProductSchema = z.object({
  name: z.string().min(1).max(100),
  price: z.coerce.number().positive(),
});

export const updateProductSchema = createProductSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "No hay nada que actualizar");

export const productQuerySchema = z.object({
  page: z.string().optional().transform((v) => (v ? parseInt(v, 10) : 1)).pipe(z.number().int().min(1)),
  limit: z.string().optional().transform((v) => (v ? parseInt(v, 10) : 10)).pipe(z.number().int().min(1).max(100)),
  search: z.string().trim().min(1).max(100).optional(),
  // Los query params llegan como texto: sólo "true" es afirmativo.
  withDeleted: z.string().optional().transform((v) => v === "true"),
});
```

Rules that need the stored row (not just the payload) belong in the service, not here — a partial `PUT` can't be validated in isolation.

---

## Step 6 — Service

This is where business rules, compound queries and `Include`s live.

```typescript
@injectable()
export class ProductsService implements IProductsService {
  constructor(
    @inject("IProductsRepository") private readonly repository: IProductsRepository,
    @inject("ILogger") private readonly logger: ILogger
  ) {}

  async getAll(query: ProductQueryDTO): Promise<PaginatedDTO<ProductDTO>> {
    const where: WhereFilter<IProduct> | undefined = query.search
      ? { name: { ilike: `%${query.search}%` } }
      : undefined;

    const paged = await this.repository.getPaged(query.page, query.limit, {
      where,
      withDeleted: query.withDeleted,
      orderBy: { field: "name", direction: "asc" },
    });

    return {
      data: paged.items.map((p) => this.toDTO(p)),
      total: paged.total,
      page: paged.page,
      limit: paged.limit,
      pages: paged.pages,
    };
  }

  async create(product: CreateProductDTO): Promise<ProductDTO> {
    // Una sola sentencia: ya es atómica, no necesita transacción explícita.
    return this.toDTO(await this.repository.insert(product));
  }

  softDelete(id: number): Promise<boolean> { return this.repository.softDelete(id); }
  restore(id: number): Promise<boolean> { return this.repository.restore(id); }
  hardDelete(id: number): Promise<boolean> { return this.repository.hardDelete(id); }
}
```

**Relations** — resolve them here with `loadRelated`, one batched query per relation:

```typescript
const categories = await loadRelated<IProduct, ICategory>(products, {
  foreignKey: "fkCategory",
  relatedKey: "pkCategory",
  repository: this.categoriesRepository,
});
```

**Transactions** — only when the use case writes to more than one table. Inject `IUnitOfWork` and open the block here:

```typescript
async hardDelete(id: number): Promise<boolean> {
  return this.unitOfWork.execute(async (scope) => {
    const products = scope.repository<IProduct>(ENTITY_NAMES.PRODUCTS);
    const lines = scope.repository<IOrderLine>(ENTITY_NAMES.ORDER_LINES);

    await lines.hardDeleteWhere({ fkProduct: id });      // primero la FK
    if (!(await products.hardDelete(id))) {
      throw new AppError("Product not found", 404);       // provoca el rollback
    }
    return true;
  });
}
```

---

## Step 7 — Controller

Thin: parse, delegate, map to HTTP. Use `parseId` so `/products/abc` returns 400 instead of querying a nonsense id.

```typescript
@injectable()
export class ProductsController implements IProductsController {
  constructor(@inject("IProductsService") private readonly service: IProductsService) {}

  public getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = (req.validatedQuery as ProductQueryInput | undefined) ?? {
        page: 1, limit: 10, withDeleted: false,
      };
      res.json(await this.service.getAll(query));
    } catch (err) {
      next(err);
    }
  };

  public softDelete = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const deleted = await this.service.softDelete(parseId(req.params.id, "product"));
      if (!deleted) throw new AppError("Product not found", 404);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };
}
```

`req.validatedQuery` is typed `unknown`; the controller asserts the shape its own schema produces.

---

## Step 8 — Routes

`src/presentation/routes/products.route.ts`, with `@openapi` JSDoc on each handler:

```typescript
app.get(
  "/products",
  this.jwtPlugin.middleware,
  validateQuery(productQuerySchema),
  this.productsController.getAll.bind(this.productsController)
);

app.delete("/products/:id", this.jwtPlugin.middleware, this.productsController.softDelete.bind(...));
app.delete("/products/:id/hard", this.jwtPlugin.middleware, this.productsController.hardDelete.bind(...));
app.post("/products/:id/restore", this.jwtPlugin.middleware, this.productsController.restore.bind(...));
```

> Register literal paths **before** parametric ones — `/products/stats` must come before `/products/:id`, or `stats` is parsed as an id.

Mount it in `src/presentation/routes/index.route.ts`:

```typescript
new ProductsRoutes().register(apiRouter);
```

---

## Step 9 — DI registration

In `src/core/di/repository.factory.ts`, add the store to both branches (Oracle and memory) and to the unit-of-work registry:

```typescript
const products = new OracleGenericRepository<IProduct>(oracle, PRODUCTS_ENTITY, logger);
// ...
[ENTITY_NAMES.PRODUCTS, products],
```

Then in `src/core/di/container.ts`:

```typescript
container.register("ProductsStore", { useValue: persistence.stores.products });
container.register<IProductsRepository>("IProductsRepository", { useClass: ProductsRepository });
container.register<IProductsService>("IProductsService", { useClass: ProductsService });
container.register<IProductsController>("IProductsController", { useClass: ProductsController });
```

---

## Step 10 — Tests

Coverage thresholds are enforced per layer, so a module without tests fails `npm test`. Mirror the existing suites:

| What | Example to copy |
|------|-----------------|
| Service (rules, filters, Include, transactions) | `tests/unit/services/branches.service.unit.test.ts` |
| Controller (status codes, `next(err)`) | `tests/unit/controllers/branches.controller.unit.test.ts` |
| Repository (generic delegation + extra SQL) | `tests/unit/repositories/appointments.repository.unit.test.ts` |
| Validators | `tests/unit/application/validators/branches.validators.unit.test.ts` |

The generic repository itself is already covered; you don't need to retest CRUD. Use `MemoryGenericRepository` as a real store in service tests when a mock would be more work than the real thing.

---

## Checklist

- [ ] Model in `domain/models/` + name in `ENTITY_NAMES`
- [ ] Mapping in `repositories/entities.ts` (+ `seed-data.ts`, + Oracle DDL)
- [ ] Repository contract (`IGenericRepository<T>`, plus extra methods only if needed)
- [ ] `XRepository extends BaseModuleRepository<T>`
- [ ] DTOs with `@openapi` annotations
- [ ] Zod validators for body and query
- [ ] Service with the business rules
- [ ] Controller using `parseId`
- [ ] Routes with OpenAPI JSDoc, literal paths before parametric ones
- [ ] Store, repository, service and controller registered in the DI container
- [ ] Router mounted in `index.route.ts`
- [ ] Tests for service, controller, repository and validators
- [ ] `npm test` and `npm run lint` clean
