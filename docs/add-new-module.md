# Adding a New Module

This guide shows how to add a complete CRUD resource on top of the **generic repository** — no SQL, no hand-written datasource. We use `Products` as the example. The `Branches` module in this repo is the same thing, end to end, if you prefer reading finished code.

Read **[data-access.md](data-access.md)** first if you haven't; this guide assumes its vocabulary.

---

## Overview

Create the files in this order (inner layers first):

1. Domain model & entity name
2. Entity mapping (+ seed for the in-memory mode)
3. Repository contract & implementation
4. DTOs
5. Zod validators
6. Service (business rules)
7. Controller — which declares its own routes
8. DI registration
9. Tests

There is no step for routes or for documentation: both come out of the
decorators on the controller. See **[decorated-routes.md](decorated-routes.md)**.

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

Add sample rows for the in-memory driver in `src/infrastructure/repositories/seed-data.ts`, and the table to the engines you actually use — `docker/<engine>/` holds a schema and a seed for each one, all deliberate twins of `docker/oracle/sql/01_schema.sql`. Follow the same convention (identity PK, `AVAILABLE` as 0/1, `CREATED_AT` / `UPDATED_AT`), because the entity mapping is shared: one column named differently on one engine breaks the SQL the generic repository generates for it.

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
    @inject(TOKENS.ProductsStore) store: IGenericRepository<IProduct>,
    @inject(TOKENS.ILogger) logger: ILogger
  ) {
    super(store, logger, "ProductsRepository");
  }
}
```

`BaseModuleRepository` forwards every generic method and adds the error logging, so there is no per-method `try/catch`. For extra SQL, use `SqlGenericRepository.executeRaw()` — `AppointmentsRepository.countByStatus` is the worked example, including the fallback for the drivers that are not SQL.

---

## Step 4 — DTOs

`src/application/dtos/products.dtos.ts`. Declare it once with Zod: `z.infer`
gives the TypeScript type and the registry publishes the OpenAPI component, so
there is no schema to write in a comment and nothing that can drift from the
code.

```typescript
import { z } from "zod";
import { defineDto, definePagedDto } from "./dto.registry";

export const productDto = defineDto(
  "Product",
  z.object({
    id: z.int().meta({ examples: [1] }),
    name: z.string().meta({ examples: ["Teclado"] }),
    price: z.number().meta({ examples: [499.9] }),
    available: z.boolean().optional(),
  })
);

export const paginatedProductsDto = definePagedDto("PaginatedProducts", productDto);

export type ProductDTO = z.infer<typeof productDto>;

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

`PaginationDTO` and `PaginatedDTO<T>` are shared — import them from
`application/dtos/common.dtos`.

**Add the file to the `dtos/index.ts` barrel.** A DTO registers itself when its
module *loads*, and everywhere else imports it as a type, which TypeScript
erases. A DTO missing from the barrel simply will not appear in the
documentation.

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
      ? { name: { contains: query.search } }
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

### Transactions

Open one when the use case **writes in more than one place**, or when it
**decides based on what it just read** — checking something is free and taking
it are two statements, and another request fits between them.

Extend `TransactionalService` and mark the method:

```typescript
@injectable()
export class ProductsService extends TransactionalService implements IProductsService {
  constructor(
    @inject(TOKENS.IProductsRepository) private readonly repository: IProductsRepository,
    @inject(TOKENS.IOrderLinesRepository) private readonly lines: IOrderLinesRepository,
    @inject(TOKENS.IUnitOfWork) unitOfWork: IUnitOfWork,
    @inject(TOKENS.ITransactionContext) transactions: ITransactionContext,
    @inject(TOKENS.ILogger) private readonly logger: ILogger
  ) {
    super(unitOfWork, transactions);
  }

  @Transactional()
  async hardDelete(id: number): Promise<boolean> {
    await this.lockRow(ENTITY_NAMES.PRODUCTS, id);        // primera sentencia

    await this.lines.hardDeleteWhere({ fkProduct: id });  // primero la FK
    if (!(await this.repository.hardDelete(id))) {
      throw new AppError("Product not found", 404);       // provoca el rollback
    }
    return true;
  }
}
```

The injected repositories bind themselves to the open transaction, so nothing is
passed around and a private helper that only needed an id keeps taking an id.
`lockRow` comes from the base class and fails outside a transaction, naming the
missing decorator.

**When the decorator does not fit.** It wraps the *whole* method, so anything
that must happen outside the transaction cannot stay in it:

- a read needed **before** opening, to decide what to lock — done inside, that
  plain SELECT pins MySQL's snapshot ahead of the lock;
- a projection **after** committing — inside, it only holds the lock longer.

Split them: a public method that orchestrates, and a decorated private one with
the transactional core. `AppointmentsService.create` and `update` are both built
that way. Full reference in [data-access.md](data-access.md).

---

## Step 7 — Controller

Thin: parse, delegate, map to HTTP. Use `parseId` so `/products/abc` returns 400
instead of querying a nonsense id.

The routes live here too. Each decorator produces three things at once — the
Express route, the request validation and the OpenAPI operation — from a single
declaration, so they cannot disagree.

```typescript
@injectable()
@ApiController("/products", { tag: "Products", token: TOKENS.IProductsController })
export class ProductsController implements IProductsController {
  constructor(@inject(TOKENS.IProductsService) private readonly service: IProductsService) {}

  @Get("/", {
    summary: "Listado paginado de productos",
    query: productQuerySchema,
    responses: { 200: { description: "Productos encontrados", ref: "PaginatedProducts" } },
  })
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

  @Delete("/:id", {
    summary: "Baja lógica de un producto",
    params: { id: "integer" },
    responses: { 204: "Producto dado de baja", 404: "Producto no encontrado" },
  })
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

`req.validatedQuery` is typed `unknown`; the controller asserts the shape its own
schema produces.

Three things worth knowing, all covered in
**[decorated-routes.md](decorated-routes.md)**:

- **Every route requires a token** unless it declares `public: true`. Forgetting
  the flag closes an endpoint rather than opening one.
- **Declaration order is route order.** `/products/stats` must be declared before
  `/products/:id`, or `stats` is parsed as an id — same rule as in a route file,
  now enforced by where the method sits in the class.
- **The 401 and the error body are added for you.** Any 4xx or 5xx without an
  explicit body references the shared `ErrorResponse` component.

To mount it, add one `import` line to `src/presentation/routing/index.route.ts`.
That import is what runs the decorators; the registry does the rest.

---

## Step 8 — DI registration

In `src/core/di/repository.factory.ts`, add the store to each builder — SQL, MongoDB and memory — and to the unit-of-work registry. The builders differ only in which driver class they instantiate:

```typescript
// buildSqlPersistence — covers Oracle, SQL Server, PostgreSQL and MySQL
const products = new SqlGenericRepository<IProduct>(executor, dialect, PRODUCTS_ENTITY, logger);
// ...
[ENTITY_NAMES.PRODUCTS, products],
```

Add the store to `src/core/di/modules/persistence.module.ts` and its token to `src/core/di/tokens.ts`:

```typescript
// tokens.ts
ProductsStore: "ProductsStore",
IProductsRepository: "IProductsRepository",
IProductsService: "IProductsService",
IProductsController: "IProductsController",

// persistence.module.ts
container.register(TOKENS.ProductsStore, { useValue: persistence.stores.products });
```

Then create `src/core/di/modules/features/products.module.ts` with the module's three layers:

```typescript
export function registerProducts(): void {
  container.register<IProductsRepository>(TOKENS.IProductsRepository, {
    useClass: ProductsRepository,
  });
  container.register<IProductsService>(TOKENS.IProductsService, { useClass: ProductsService });
  container.register<IProductsController>(TOKENS.IProductsController, {
    useClass: ProductsController,
  });
}
```

and call it from `src/core/di/container.ts` — one line, next to the other modules:

```typescript
registerProducts();
```

Always inject through `TOKENS`, never a bare string: tsyringe resolves by string, so a typo
compiles fine and only blows up when that class is constructed.

---

## Step 9 — Tests

Write the tests for **what the module adds**, not for what it inherits.

| The module has… | Write |
|-----------------|-------|
| No rules of its own (plain CRUD) | Only an e2e flow. Copy `tests/e2e/users.e2e.test.ts` |
| Business rules | A unit test for the service, with the edge cases. Copy `tests/unit/services/branches.service.unit.test.ts` |
| Its own query beyond the generic API | A unit test for the repository. Copy `tests/unit/repositories/appointments.repository.unit.test.ts` |
| Validators worth pinning | Copy `tests/unit/application/validators/branches.validators.unit.test.ts` |

Every module gets **one e2e flow** regardless: it is what proves the wiring —
route mounted, guard applied, validation running, status codes and the error
envelope. What it does not need to do is enumerate cases; those go in the unit
test, where they are cheap.

There is no controller unit test in that table on purpose. If the controller
comes from `CrudController`, testing it would be testing the framework through a
module that adds nothing. If it has a handler of its own, that handler's rules
belong in the service.

The generic repository itself is already covered; you don't need to retest CRUD. Use `MemoryGenericRepository` as a real store in service tests when a mock would be more work than the real thing.

---

## Checklist

- [ ] Model in `domain/models/` + name in `ENTITY_NAMES`
- [ ] Mapping in `repositories/entities.ts` (+ `seed-data.ts`, + the DDL of each engine you use)
- [ ] Repository contract (`IGenericRepository<T>`, plus extra methods only if needed)
- [ ] `XRepository extends BaseModuleRepository<T>`
- [ ] DTOs declared with `defineDto`, and the file added to the `dtos/index.ts` barrel
- [ ] Zod validators for body and query
- [ ] Service with the business rules
- [ ] Controller using `parseId`
- [ ] `@ApiController` + a verb decorator per handler, literal paths declared before parametric ones
- [ ] Store, repository, service and controller registered in the DI container
- [ ] `import` of the controller added to `routing/index.route.ts`
- [ ] Tests for service, controller, repository and validators
- [ ] `npm test` and `npm run lint` clean
