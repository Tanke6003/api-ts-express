// tests/unit/presentation/crud.controller.unit.test.ts
//
// Los cinco manejadores del CRUD por HTTP, montados como en producción: rutas
// desde @Crud, guard, validación y el manejador global de errores.
import express from "express";
import request from "supertest";
import { z } from "zod";
import { CrudController } from "../../../src/presentation/controllers/crud.controller";
import { ApiController } from "../../../src/presentation/routing/route.decorators";
import { Crud } from "../../../src/presentation/routing/crud.decorator";
import { registerController } from "../../../src/presentation/routing/router.builder";
import { errorHandler } from "../../../src/presentation/middlewares/errorHandler.middleware";
import type { ICrudService } from "../../../src/application/services/crud.service";
import type { IRequestContext } from "../../../src/domain/interfaces/infrastructure/plugins/request-context.plugin.interface";

interface ItemDTO {
  id: number;
  name: string;
}

const bodySchema = z.object({ name: z.string().min(1) });
const querySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

let service: jest.Mocked<ICrudService<ItemDTO>>;

@ApiController("/items", { tag: "Items" })
@Crud({
  resource: "el artículo",
  dto: "Item",
  schemas: { create: bodySchema, update: bodySchema, query: querySchema },
})
class ItemsController extends CrudController {
  constructor() {
    super(service, { getCurrentUser: () => null } as unknown as IRequestContext, "el artículo");
  }
}

/** Controlador que se queda sólo con dos verbos y escribe el suyo. */
@ApiController("/parciales", { tag: "Parciales" })
@Crud({ resource: "el parcial", dto: "Item", verbs: ["list", "getOne"] })
class ParcialesController extends CrudController {
  constructor() {
    super(service, { getCurrentUser: () => null } as unknown as IRequestContext, "el parcial");
  }
}

const buildApp = (type: never, instance: object) => {
  const app = express();
  app.use(express.json());
  const router = express.Router();
  registerController(router, type, instance, (_req, _res, next) => next());
  app.use(router);
  app.use(errorHandler);
  return app;
};

describe("CrudController", () => {
  let app: express.Express;

  beforeEach(() => {
    service = {
      list: jest.fn(),
      get: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    } as never;
    app = buildApp(ItemsController as never, new ItemsController());
  });

  it("lista pasando la paginación ya validada", async () => {
    service.list.mockResolvedValue({ data: [], total: 0, page: 2, limit: 5, pages: 0 });

    const res = await request(app).get("/items?page=2&limit=5");

    expect(res.status).toBe(200);
    expect(service.list).toHaveBeenCalledWith(2, 5, { withDeleted: undefined });
  });

  it("cae a la primera página si no se pide nada", async () => {
    service.list.mockResolvedValue({ data: [], total: 0, page: 1, limit: 10, pages: 0 });

    await request(app).get("/items");

    expect(service.list).toHaveBeenCalledWith(1, 10, { withDeleted: undefined });
  });

  it("devuelve 404 con un código estable cuando no hay fila", async () => {
    service.get.mockResolvedValue(null);

    const res = await request(app).get("/items/9");

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: "NOT_FOUND" });
    expect(res.body.message).toContain("el artículo");
  });

  it("un id que no es un número es 400, no una consulta absurda", async () => {
    const res = await request(app).get("/items/abc");

    expect(res.status).toBe(400);
    expect(service.get).not.toHaveBeenCalled();
  });

  it("crea devolviendo el recurso con su PK, no un acuse", async () => {
    service.create.mockResolvedValue({ id: 7, name: "nuevo" });

    const res = await request(app).post("/items").send({ name: "nuevo" });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ id: 7, name: "nuevo" });
  });

  it("rechaza el cuerpo inválido antes de llegar al servicio", async () => {
    const res = await request(app).post("/items").send({ name: "" });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
    expect(service.create).not.toHaveBeenCalled();
  });

  it("actualiza, y 404 si no existe", async () => {
    service.update.mockResolvedValueOnce({ id: 1, name: "otro" });
    expect((await request(app).put("/items/1").send({ name: "otro" })).status).toBe(200);

    service.update.mockResolvedValueOnce(null);
    expect((await request(app).put("/items/9").send({ name: "otro" })).status).toBe(404);
  });

  it("la baja lógica responde 204, y 404 si no tocó nada", async () => {
    service.softDelete.mockResolvedValueOnce(true);
    expect((await request(app).delete("/items/1")).status).toBe(204);

    service.softDelete.mockResolvedValueOnce(false);
    expect((await request(app).delete("/items/9")).status).toBe(404);
  });

  describe("verbos a la carta", () => {
    it("monta sólo los declarados", async () => {
      const parciales = buildApp(ParcialesController as never, new ParcialesController());
      service.list.mockResolvedValue({ data: [], total: 0, page: 1, limit: 10, pages: 0 });

      expect((await request(parciales).get("/parciales")).status).toBe(200);
      // No se pidió `create`, así que esa ruta no existe.
      expect((await request(parciales).post("/parciales").send({ name: "x" })).status).toBe(404);
    });
  });
});
