// tests/unit/presentation/routing/router.builder.unit.test.ts
import express from "express";
import request from "supertest";
import { z } from "zod";
import {
  ApiController,
  Delete,
  Get,
  Post,
  joinPath,
} from "../../../../src/presentation/routing/route.decorators";
import { registerController } from "../../../../src/presentation/routing/router.builder";
import { buildOpenApiPaths } from "../../../../src/presentation/routing/openapi.builder";
import { getControllerMetadata } from "../../../../src/presentation/routing/route.decorators";
import { errorHandler } from "../../../../src/presentation/middlewares/errorHandler.middleware";

const bodySchema = z.object({ name: z.string().min(1).max(10) });
const querySchema = z.object({ page: z.string().optional() });

@ApiController("/things", { tag: "Things" })
class ThingsController {
  @Get("/", { summary: "Lista", query: querySchema, responses: { 200: "Listado" } })
  public list = (_req: express.Request, res: express.Response) => res.json({ ok: "list" });

  @Get("/open", { summary: "Sin token", public: true })
  public open = (_req: express.Request, res: express.Response) => res.json({ ok: "open" });

  @Get("/:id", { summary: "Uno", params: { id: "integer" } })
  public byId = (req: express.Request, res: express.Response) => res.json({ id: req.params.id });

  @Post("/", { summary: "Alta", body: bodySchema, responses: { 201: "Creado" } })
  public create = (req: express.Request, res: express.Response) => res.status(201).json(req.body);

  @Delete("/:id", { summary: "Baja", params: { id: "integer" }, responses: { 204: "Borrado" } })
  public remove = (_req: express.Request, res: express.Response) => res.status(204).send();
}

/** Guard de mentira: rechaza salvo que venga la cabecera. */
const guard: express.RequestHandler = (req, res, next) =>
  req.headers.authorization ? next() : res.status(401).json({ status: "error" });

const buildApp = () => {
  const app = express();
  app.use(express.json());

  const router = express.Router();
  registerController(router, ThingsController, new ThingsController(), guard);
  app.use("/api", router);
  app.use(errorHandler);

  return app;
};

describe("router.builder", () => {
  const app = buildApp();
  const authed = (path: string) => request(app).get(path).set("Authorization", "Bearer x");

  it("monta cada verbo en su ruta, con el prefijo del controlador", async () => {
    expect((await authed("/api/things")).body).toEqual({ ok: "list" });
    expect((await authed("/api/things/7")).body).toEqual({ id: "7" });
    expect((await request(app).delete("/api/things/7").set("Authorization", "x")).status).toBe(204);
  });

  it("exige token por defecto", async () => {
    expect((await request(app).get("/api/things")).status).toBe(401);
  });

  it("deja pasar las rutas marcadas como públicas", async () => {
    const res = await request(app).get("/api/things/open");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: "open" });
  });

  it("valida el cuerpo con el mismo esquema que documenta la ruta", async () => {
    const rechazado = await request(app)
      .post("/api/things")
      .set("Authorization", "x")
      .send({ name: "" });

    expect(rechazado.status).toBe(400);
    expect(rechazado.body.code).toBe("VALIDATION_ERROR");

    const aceptado = await request(app)
      .post("/api/things")
      .set("Authorization", "x")
      .send({ name: "ok" });

    expect(aceptado.status).toBe(201);
  });

  it("valida antes de llamar al manejador pero después del guard", async () => {
    // Sin token y con cuerpo inválido gana el 401: a quien no está autenticado
    // no se le cuenta qué campos espera el endpoint.
    const res = await request(app).post("/api/things").send({ name: "" });

    expect(res.status).toBe(401);
  });

  it("explica el fallo si la clase no está decorada", () => {
    class SinDecorar {}

    expect(() =>
      registerController(express.Router(), SinDecorar, new SinDecorar(), guard)
    ).toThrow(/no está decorado con @ApiController/);
  });

  it("explica el fallo si el manejador no existe en la instancia", () => {
    expect(() => registerController(express.Router(), ThingsController, {}, guard)).toThrow(
      /no es una función/
    );
  });

  describe("orden de las rutas", () => {
    /**
     * `/:id` se declara **antes** que `/stats`, al revés de como habría que
     * escribirlo si el orden fuera el del código. Con el orden por
     * especificidad da igual: gana la estática.
     */
    @ApiController("/orden", { tag: "Orden" })
    class DesordenadoController {
      @Get("/:id", { public: true })
      public byId = (req: express.Request, res: express.Response) =>
        res.json({ quien: "byId", id: req.params.id });

      @Get("/stats", { public: true })
      public stats = (_req: express.Request, res: express.Response) =>
        res.json({ quien: "stats" });

      @Get("/:id/hard", { public: true })
      public hard = (_req: express.Request, res: express.Response) =>
        res.json({ quien: "hard" });
    }

    const app = (() => {
      const instance = express();
      const router = express.Router();
      registerController(router, DesordenadoController, new DesordenadoController(), guard);
      instance.use(router);
      return instance;
    })();

    it("una ruta estática gana a una paramétrica aunque se declare después", async () => {
      // Sin el orden por especificidad, "stats" se leería como un id y esto
      // devolvería { quien: "byId", id: "stats" }.
      expect((await request(app).get("/orden/stats")).body).toEqual({ quien: "stats" });
    });

    it("la paramétrica sigue funcionando para lo demás", async () => {
      expect((await request(app).get("/orden/7")).body).toEqual({ quien: "byId", id: "7" });
    });

    it("las rutas más largas no compiten con las cortas", async () => {
      expect((await request(app).get("/orden/7/hard")).body).toEqual({ quien: "hard" });
    });

    it("dos rutas iguales son un error al arrancar, no la segunda ignorada", () => {
      @ApiController("/dup", { tag: "Dup" })
      class DuplicadoController {
        @Get("/:id", { public: true })
        public uno = (_req: express.Request, res: express.Response) => res.json({});

        @Get("/:id", { public: true })
        public dos = (_req: express.Request, res: express.Response) => res.json({});
      }

      expect(() =>
        registerController(express.Router(), DuplicadoController, new DuplicadoController(), guard)
      ).toThrow(/declara GET \/dup\/:id dos veces/);
    });
  });

  describe("joinPath", () => {
    it("no deja barra final cuando la ruta es la raíz del controlador", () => {
      expect(joinPath("/things", "/")).toBe("/things");
      expect(joinPath("/things", "")).toBe("/things");
      expect(joinPath("/things", "/:id")).toBe("/things/:id");
    });
  });
});

describe("openapi.builder", () => {
  const paths = buildOpenApiPaths([getControllerMetadata(ThingsController)!]);

  it("documenta cada ruta bajo su camino en notación de OpenAPI", () => {
    expect(Object.keys(paths).sort()).toEqual(["/things", "/things/open", "/things/{id}"]);
    expect(Object.keys(paths["/things"]).sort()).toEqual(["get", "post"]);
  });

  it("saca los parámetros de query del esquema de Zod", () => {
    expect((paths["/things"].get as Record<string, unknown>).parameters).toEqual([
      { in: "query", name: "page", required: false, schema: { type: "string" } },
    ]);
  });

  it("saca el cuerpo del esquema, con sus restricciones", () => {
    const post = paths["/things"].post as Record<string, never>;
    const schema = post.requestBody.content["application/json"].schema;

    expect(schema).toMatchObject({
      type: "object",
      properties: { name: { type: "string", minLength: 1, maxLength: 10 } },
      required: ["name"],
    });
  });

  it("declara el 401 en lo protegido y lo omite en lo público", () => {
    const protegido = paths["/things"].get as Record<string, never>;
    const publico = paths["/things/open"].get as Record<string, never>;

    expect(protegido.responses["401"]).toBeDefined();
    expect(protegido.security).toEqual([{ bearerAuth: [] }]);

    expect(publico.responses["401"]).toBeUndefined();
    expect(publico.security).toBeUndefined();
  });

  it("marca los parámetros de ruta como obligatorios", () => {
    expect((paths["/things/{id}"].get as Record<string, unknown>).parameters).toEqual([
      { in: "path", name: "id", required: true, schema: { type: "integer" } },
    ]);
  });
});
