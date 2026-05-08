# Adding a New Module

This guide shows you how to add a complete CRUD resource following the same patterns as the `Users` module. We use `Products` as an example.

---

## Overview

You need to create files in this order (inner layers first):

1. Domain model & interfaces
2. DTO
3. DataSource (dummy)
4. Repository
5. Service
6. Controller
7. Route
8. DI registration

---

## Step 1 — Domain model

`src/domain/models/products.model.ts`

```typescript
export interface IProduct {
  pkProduct: number;
  name: string;
  price: number;
  available?: boolean;
}
```

---

## Step 2 — Domain interfaces

### DataSource interface
`src/domain/interfaces/infrastructure/datasources/products.datasource.interface.ts`

```typescript
import { IProduct } from "../../../models/products.model";

export interface IProductsDataSource {
  getAllProducts(): Promise<IProduct[]>;
  getProductById(id: number): Promise<IProduct | null>;
  createProduct(product: IProduct): Promise<boolean>;
  updateProduct(id: number, product: Partial<IProduct>): Promise<boolean>;
  deleteProduct(id: number): Promise<boolean>;
}
```

### Repository interface
`src/domain/interfaces/infrastructure/repositories/products.repository.interface.ts`

```typescript
import { IProduct } from "../../../models/products.model";

export interface IProductsRepository {
  getAllProducts(): Promise<IProduct[]>;
  getProductById(id: number): Promise<IProduct | null>;
  createProduct(product: IProduct): Promise<boolean>;
  updateProduct(id: number, product: Partial<IProduct>): Promise<boolean>;
  deleteProduct(id: number): Promise<boolean>;
}
```

### Service interface
`src/domain/interfaces/application/services/products.service.interface.ts`

```typescript
import { ProductDTO } from "../../../../application/dtos/products.dtos";

export interface IProductsService {
  getAllProducts(): Promise<ProductDTO[]>;
  getProductById(id: number): Promise<ProductDTO | null>;
  createProduct(product: ProductDTO): Promise<boolean>;
  updateProduct(id: number, product: Partial<ProductDTO>): Promise<boolean>;
  deleteProduct(id: number): Promise<boolean>;
}
```

### Controller interface
`src/domain/interfaces/presentation/controllers/products.controller.interface.ts`

```typescript
import { Request, Response } from "express";

export interface IProductsController {
  getAllProducts(req: Request, res: Response): Promise<void>;
  getProductById(req: Request, res: Response): Promise<void>;
  createProduct(req: Request, res: Response): Promise<void>;
  updateProduct(req: Request, res: Response): Promise<void>;
  deleteProduct(req: Request, res: Response): Promise<void>;
}
```

---

## Step 3 — DTO

`src/application/dtos/products.dtos.ts`

```typescript
/**
 * @openapi
 * components:
 *   schemas:
 *     Product:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 1
 *         name:
 *           type: string
 *           example: Widget
 *         price:
 *           type: number
 *           example: 9.99
 */
export interface ProductDTO {
  id: number;
  name: string;
  price: number;
}
```

---

## Step 4 — Dummy DataSource

`src/infrastructure/datasources/dummy/products.dummy.datasource.ts`

```typescript
import { IProductsDataSource } from "../../../domain/interfaces/infrastructure/datasources/products.datasource.interface";
import { IProduct } from "../../../domain/models/products.model";

export class ProductsDummyDataSource implements IProductsDataSource {
  private products: IProduct[] = [
    { pkProduct: 1, name: "Widget A", price: 9.99, available: true },
    { pkProduct: 2, name: "Widget B", price: 19.99, available: true },
  ];

  private idCounter = this.products.length + 1;

  async getAllProducts(): Promise<IProduct[]> {
    return this.products.filter(p => p.available);
  }

  async getProductById(id: number): Promise<IProduct | null> {
    return this.products.find(p => p.pkProduct === id && p.available) ?? null;
  }

  async createProduct(product: IProduct): Promise<boolean> {
    this.products.push({ ...product, pkProduct: this.idCounter++, available: true });
    return true;
  }

  async updateProduct(id: number, product: Partial<IProduct>): Promise<boolean> {
    const record = this.products.find(p => p.pkProduct === id && p.available);
    if (!record) return false;
    Object.assign(record, product);
    return true;
  }

  async deleteProduct(id: number): Promise<boolean> {
    const record = this.products.find(p => p.pkProduct === id && p.available);
    if (!record) return false;
    record.available = false;
    return true;
  }
}
```

---

## Step 5 — Repository

`src/infrastructure/repositories/products.repository.ts`

```typescript
import { inject, injectable } from "tsyringe";
import { IProductsRepository } from "../../domain/interfaces/infrastructure/repositories/products.repository.interface";
import { IProductsDataSource } from "../../domain/interfaces/infrastructure/datasources/products.datasource.interface";
import { ILogger } from "../../domain/interfaces/infrastructure/plugins/logger.plugin.interface";
import { IProduct } from "../../domain/models/products.model";

@injectable()
export class ProductsRepository implements IProductsRepository {
  constructor(
    @inject("IProductsDataSource") private readonly dataSource: IProductsDataSource,
    @inject("ILogger") private readonly logger: ILogger
  ) {}

  async getAllProducts(): Promise<IProduct[]> {
    try {
      return await this.dataSource.getAllProducts();
    } catch (error) {
      this.logger.error("Error in ProductsRepository.getAllProducts", { error });
      throw new Error("Failed to fetch products.");
    }
  }

  async getProductById(id: number): Promise<IProduct | null> {
    try {
      return await this.dataSource.getProductById(id);
    } catch (error) {
      this.logger.error("Error in ProductsRepository.getProductById", { id, error });
      throw new Error("Failed to fetch product.");
    }
  }

  async createProduct(product: IProduct): Promise<boolean> {
    try {
      return await this.dataSource.createProduct(product);
    } catch (error) {
      this.logger.error("Error in ProductsRepository.createProduct", { product, error });
      throw new Error("Failed to create product.");
    }
  }

  async updateProduct(id: number, product: Partial<IProduct>): Promise<boolean> {
    try {
      return await this.dataSource.updateProduct(id, product);
    } catch (error) {
      this.logger.error("Error in ProductsRepository.updateProduct", { id, product, error });
      throw new Error("Failed to update product.");
    }
  }

  async deleteProduct(id: number): Promise<boolean> {
    try {
      return await this.dataSource.deleteProduct(id);
    } catch (error) {
      this.logger.error("Error in ProductsRepository.deleteProduct", { id, error });
      throw new Error("Failed to delete product.");
    }
  }
}
```

---

## Step 6 — Service

`src/application/services/products.service.ts`

```typescript
import { inject, injectable } from "tsyringe";
import { IProductsService } from "../../domain/interfaces/application/services/products.service.interface";
import { IProductsRepository } from "../../domain/interfaces/infrastructure/repositories/products.repository.interface";
import { ProductDTO } from "../dtos/products.dtos";
import { IProduct } from "../../domain/models/products.model";

@injectable()
export class ProductsService implements IProductsService {
  constructor(
    @inject("IProductsRepository") private readonly repository: IProductsRepository
  ) {}

  async getAllProducts(): Promise<ProductDTO[]> {
    const products = await this.repository.getAllProducts();
    return products.map(p => this.toDTO(p));
  }

  async getProductById(id: number): Promise<ProductDTO | null> {
    const product = await this.repository.getProductById(id);
    if (!product) throw new Error("Product not found");
    return this.toDTO(product);
  }

  async createProduct(dto: ProductDTO): Promise<boolean> {
    return await this.repository.createProduct(this.toModel(dto));
  }

  async updateProduct(id: number, dto: Partial<ProductDTO>): Promise<boolean> {
    return await this.repository.updateProduct(id, this.toModel(dto as ProductDTO));
  }

  async deleteProduct(id: number): Promise<boolean> {
    return await this.repository.deleteProduct(id);
  }

  private toDTO(p: IProduct): ProductDTO {
    return { id: p.pkProduct, name: p.name, price: p.price };
  }

  private toModel(dto: ProductDTO): IProduct {
    return { pkProduct: dto.id ?? 0, name: dto.name, price: dto.price };
  }
}
```

---

## Step 7 — Controller

`src/presentation/controllers/products.controller.ts`

```typescript
import { Request, Response } from "express";
import { inject, injectable } from "tsyringe";
import { IProductsController } from "../../domain/interfaces/presentation/controllers/products.controller.interface";
import { IProductsService } from "../../domain/interfaces/application/services/products.service.interface";

@injectable()
export class ProductsController implements IProductsController {
  constructor(
    @inject("IProductsService") private readonly productsService: IProductsService
  ) {}

  public getAllProducts = async (_req: Request, res: Response): Promise<void> => {
    try {
      res.json(await this.productsService.getAllProducts());
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  };

  public getProductById = async (req: Request, res: Response): Promise<void> => {
    try {
      const product = await this.productsService.getProductById(Number(req.params.id));
      if (!product) { res.status(404).json({ message: "Product not found" }); return; }
      res.json(product);
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  };

  public createProduct = async (req: Request, res: Response): Promise<void> => {
    try {
      res.status(201).json(await this.productsService.createProduct(req.body));
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  };

  public updateProduct = async (req: Request, res: Response): Promise<void> => {
    try {
      const updated = await this.productsService.updateProduct(Number(req.params.id), req.body);
      if (!updated) { res.status(404).json({ message: "Product not found" }); return; }
      res.json(updated);
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  };

  public deleteProduct = async (req: Request, res: Response): Promise<void> => {
    try {
      const deleted = await this.productsService.deleteProduct(Number(req.params.id));
      if (!deleted) { res.status(404).json({ message: "Product not found" }); return; }
      res.status(204).send();
    } catch {
      res.status(500).json({ message: "Internal server error" });
    }
  };
}
```

---

## Step 8 — Route

`src/presentation/routes/products.route.ts`

```typescript
import { container } from "tsyringe";
import { IProductsController } from "../../domain/interfaces/presentation/controllers/products.controller.interface";

export class ProductsRoutes {
  private controller: IProductsController;

  constructor() {
    this.controller = container.resolve<IProductsController>("IProductsController");
  }

  public register(router: any) {
    /**
     * @openapi
     * /api/products:
     *   get:
     *     tags: [Products]
     *     summary: Get all products
     *     responses:
     *       200:
     *         description: List of products
     */
    router.get("/products", this.controller.getAllProducts.bind(this.controller));
    router.get("/products/:id", this.controller.getProductById.bind(this.controller));
    router.post("/products", this.controller.createProduct.bind(this.controller));
    router.put("/products/:id", this.controller.updateProduct.bind(this.controller));
    router.delete("/products/:id", this.controller.deleteProduct.bind(this.controller));
  }
}
```

---

## Step 9 — Register in the DI container

Open `src/core/di/container.ts` and add:

```typescript
import { IProductsDataSource } from "../../domain/interfaces/infrastructure/datasources/products.datasource.interface";
import { ProductsDummyDataSource } from "../../infrastructure/datasources/dummy/products.dummy.datasource";
import { IProductsRepository } from "../../domain/interfaces/infrastructure/repositories/products.repository.interface";
import { ProductsRepository } from "../../infrastructure/repositories/products.repository";
import { IProductsService } from "../../domain/interfaces/application/services/products.service.interface";
import { ProductsService } from "../../application/services/products.service";
import { IProductsController } from "../../domain/interfaces/presentation/controllers/products.controller.interface";
import { ProductsController } from "../../presentation/controllers/products.controller";

// DataSources
container.register<IProductsDataSource>("IProductsDataSource", { useClass: ProductsDummyDataSource });

// Repositories
container.register<IProductsRepository>("IProductsRepository", { useClass: ProductsRepository });

// Services
container.register<IProductsService>("IProductsService", { useClass: ProductsService });

// Controllers
container.register<IProductsController>("IProductsController", { useClass: ProductsController });
```

---

## Step 10 — Register routes

Open `src/presentation/routes/index.route.ts` and add:

```typescript
import { ProductsRoutes } from "./products.route";

export class IndexRoutes {
  public static register(app: Application) {
    const apiRouter = express.Router();
    new UsersRoutes().register(apiRouter);
    new ProductsRoutes().register(apiRouter);  // ← add this
    app.use("/api", apiRouter);

    new TestRoutes().register(app);
  }
}
```

---

## Step 11 — Write tests

Create unit tests following the patterns in:
- `tests/unit/services/users.service.unit.test.ts`
- `tests/unit/controllers/users.controller.unit.test.ts`
- `tests/unit/repositories/users.repository.unit.test.ts`
- `tests/unit/datasources/dummy/users.dummy.datasource.unit.test.ts`

And integration tests following:
- `tests/integration/users.integration.test.ts`

---

## Checklist

- [ ] Domain model created
- [ ] All 4 domain interfaces created (datasource, repository, service, controller)
- [ ] DTO created with OpenAPI schema annotation
- [ ] Dummy datasource implemented
- [ ] Repository implemented
- [ ] Service implemented with DTO ↔ model mapping
- [ ] Controller implemented with error handling
- [ ] Route file with OpenAPI JSDoc comments
- [ ] DI container updated
- [ ] Index route updated
- [ ] Unit tests for datasource, repository, service, controller
- [ ] Integration tests
- [ ] `npm test` passes
- [ ] `npm run lint` passes
- [ ] `npm run build` passes
