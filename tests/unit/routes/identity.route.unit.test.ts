import request from "supertest";
import express from "express";
import { container } from "tsyringe";
import { IEnvs } from "../../../src/domain/interfaces/infrastructure/plugins/envs.plugin.interface";
import { ITokenPlugin } from "../../../src/domain/interfaces/infrastructure/plugins/token.plugin.interface";
import { IRequestContext } from "../../../src/domain/interfaces/infrastructure/plugins/request-context.plugin.interface";
import { JwtPlugin } from "../../../src/infrastructure/plugins/jwt.plugin";
import { AsyncRequestContextPlugin } from "../../../src/infrastructure/plugins/asyncRequestContext.plugin";
import { IdentityRoutes } from "../../../src/presentation/routes/identity.route";
import { TestRoutes } from "../../../src/presentation/routes/test.route";
import { requestContext } from "../../../src/presentation/middlewares/requestContext.middleware";
import { errorHandler } from "../../../src/presentation/middlewares/errorHandler.middleware";

describe("GET /api/me", () => {
  let app: express.Express;

  beforeEach(() => {
    container.reset();

    container.register<IEnvs>("IEnvs", {
      useValue: {
        getEnv: (key: string) => (key === "JWT_SECRET" ? "unit-test-secret" : ""),
      },
    });
    container.registerSingleton<IRequestContext>("IRequestContext", AsyncRequestContextPlugin);
    container.register<ITokenPlugin>("ITokenPlugin", { useClass: JwtPlugin });

    app = express();
    app.use(requestContext(container.resolve<IRequestContext>("IRequestContext")));

    const api = express.Router();
    new IdentityRoutes().register(api);
    app.use("/api", api);
    new TestRoutes().register(app);

    // Los rechazos de autenticacion los formatea el manejador global.
    app.use(errorHandler);
  });

  const tokenFor = async (query = "") =>
    (await request(app).get(`/api/generate-token${query}`)).body.token;

  it("devuelve la identidad que la API resolvió del token", async () => {
    const token = await tokenFor("?userId=7&name=Ruben&email=ruben@example.com");

    const res = await request(app).get("/api/me").set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: "7",
      name: "Ruben",
      email: "ruben@example.com",
    });
    expect(res.body.requestId).toEqual(expect.any(String));
  });

  it("el token trae valores por defecto en desarrollo", async () => {
    const res = await request(app)
      .get("/api/me")
      .set("Authorization", `Bearer ${await tokenFor()}`);

    expect(res.body).toMatchObject({ id: "1", name: "Dev User" });
  });

  it("exige token", async () => {
    expect((await request(app).get("/api/me")).status).toBe(401);
  });

  it("rechaza un token de otra firma", async () => {
    const res = await request(app).get("/api/me").set("Authorization", "Bearer no-es-un-token");
    expect(res.status).toBe(401);
  });
});
