// src/core/server.ts
import express, { Application } from "express";
import http from "http";
import type { AddressInfo } from "net";
import path from "path";
import cors from "cors";
import helmet from "helmet";
import { IndexRoutes } from "../presentation/routing/index.route";
import swaggerUi, { SwaggerUiOptions } from "swagger-ui-express";
import { container, injectable } from "tsyringe";
import { buildOpenApiSpec } from "./config/swagger.config";
import {
  areDocsEnabled,
  buildCorsOptions,
  buildHelmetOptions,
  buildRateLimiter,
  resolveBodyLimit,
  resolveTrustProxy,
} from "./config/security.config";
import { resolveApiPrefix } from "./config/api.config";
import { ILogger } from "../domain/interfaces/infrastructure/plugins/logger.plugin.interface";
import { IEnvs } from "../domain/interfaces/infrastructure/plugins/envs.plugin.interface";
import { IHealthProbe } from "../domain/interfaces/infrastructure/plugins/health-probe.interface";
import { errorHandler, notFoundHandler } from "../presentation/middlewares/errorHandler.middleware";
import { requestContext } from "../presentation/middlewares/requestContext.middleware";
import { IRequestContext } from "../domain/interfaces/infrastructure/plugins/request-context.plugin.interface";
import { TOKENS } from "./di/tokens";

@injectable()
export class Server {
  private readonly port: number;
  public app: Application = express();
  private routes = IndexRoutes;
  /**
   * El servidor HTTP, para poder cerrarlo. Sin guardarlo, un apagado ordenado no
   * tiene forma de dejar de aceptar conexiones y las peticiones en vuelo se
   * cortan a media respuesta.
   */
  private httpServer?: http.Server;

  constructor(port: number) {
    this.port = port;
  }

  /**
   * Cadena de middlewares. El orden es la mitad del trabajo: cada pieza asume
   * que las anteriores ya corrieron, y moverlas de sitio las deja sin efecto.
   * La política concreta —cupos, orígenes, límites— vive en `security.config`.
   */
  async configureMiddleware() {
    const envs: IEnvs = container.resolve(TOKENS.IEnvs);

    // Decir qué framework hay debajo no aporta nada y sí orienta a quien busca
    // una vulnerabilidad conocida.
    this.app.disable("x-powered-by");

    // Cuántos proxys de confianza hay delante. De esto depende qué IP ve el
    // limitador: mal puesto, o cuenta a todo el mundo como el balanceador, o se
    // cree la que diga el cliente.
    this.app.set("trust proxy", resolveTrustProxy(envs));

    // Lo primero de todo, incluso antes del parseo del cuerpo: asi hasta un
    // JSON mal formado se rechaza con su id de peticion, y el resto de capas
    // (logs, manejador de errores, auditoria) ven el contexto.
    const context: IRequestContext = container.resolve(TOKENS.IRequestContext);
    this.app.use(requestContext(context));

    const logger: ILogger = container.resolve(TOKENS.ILogger);

    // Antes que nada de lo que responde, para que las cabeceras acompañen
    // también a un 429 o a un rechazo de CORS.
    this.app.use(helmet(buildHelmetOptions(envs)));

    // Antes del parseo: a una petición que va a rechazarse no se le lee el
    // cuerpo, que es justo el trabajo que un abuso busca provocar.
    const limiter = buildRateLimiter(envs);
    if (limiter) this.app.use(limiter);

    // Antes del cuerpo también: un preflight no lleva ninguno.
    this.app.use(cors(buildCorsOptions(envs, logger)));

    const bodyLimit = resolveBodyLimit(envs);
    this.app.use(express.json({ limit: bodyLimit }));
    // `extended: false`: nada en el proyecto envía formularios —la interfaz de
    // ejemplo serializa a JSON—, así que basta el parser nativo.
    this.app.use(express.urlencoded({ limit: bodyLimit, extended: false }));

    this.app.use(logger.http());

    // Interfaz web de ejemplo (HTML + JS + Tailwind) servida desde /public.
    this.app.use(express.static(path.resolve(process.cwd(), "public")));
  }

  async configureScalar() {
    const { apiReference } = await import("@scalar/express-api-reference");
    this.app.use(
      "/api/scalar",
      apiReference({
        url: "/api/openapi.json",
        theme: "deepSpace",
      })
    );
  }

  async configureSwagger() {
    // Una sola especificación para Swagger y para Scalar: Scalar la lee del
    // mismo `/api/openapi.json`, así que documentar dos veces no hace falta.
    const swaggerSpec = buildOpenApiSpec();

    this.app.use(
      "/api/swagger",
      swaggerUi.serve,
      swaggerUi.setup(swaggerSpec, {
        swaggerOptions: {
          docExpansion: "none",
          persistAuthorization: true,
        },
        explorer: true,
        customSiteTitle: "API Docs",
      } as SwaggerUiOptions)
    );

    this.app.get("/api/openapi.json", (_req, res) => {
      res.json(swaggerSpec);
    });
  }

  /**
   * Rutas de negocio y las de salud.
   *
   * Salud son dos preguntas distintas y se responden por separado, porque un
   * orquestador hace cosas opuestas con cada una: si el proceso no está *vivo*
   * lo reinicia, y si no está *listo* le quita el tráfico. Con la base caída lo
   * correcto es lo segundo: reiniciar no arregla una base ajena, y quitarle el
   * tráfico manda las peticiones a una réplica que sí puede atenderlas.
   */
  async configureRoutes() {
    this.routes.register(this.app);

    const probe: IHealthProbe = container.resolve(TOKENS.IHealthProbe);

    const envs: IEnvs = container.resolve(TOKENS.IEnvs);

    const describe = (report: Awaited<ReturnType<IHealthProbe["report"]>>) => ({
      status: report.ready ? "ok" : report.shuttingDown ? "shutting_down" : "degraded",
      // Útil para saber contra qué driver está corriendo la interfaz web.
      dataSource: report.dataSource,
      database: report.database,
      // Dónde está montada la API. Lo publica aquí porque `API_PREFIX` es
      // configurable: así un cliente lo descubre en vez de darlo por supuesto,
      // y de paso se ve de un vistazo qué está sirviendo esta instancia.
      apiPrefix: resolveApiPrefix(envs),
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
    });

    /** Vivacidad: sólo dice que el proceso responde. Nunca toca la base. */
    this.app.get("/health/live", (_req, res) => {
      res.status(200).json({
        status: "ok",
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
      });
    });

    /** Disponibilidad: 503 con la base caída o mientras se drena. */
    const readiness = async (_req: express.Request, res: express.Response) => {
      const report = await probe.report();
      res.status(report.ready ? 200 : 503).json(describe(report));
    };

    this.app.get("/health/ready", readiness);
    // Alias histórico; lo consume la interfaz de ejemplo (public/js/api.js).
    this.app.get("/health", readiness);
  }

  /**
   * 404 y manejador de errores. Se registra al final del todo, despues de las
   * rutas de negocio y de Swagger/Scalar: un manejador de errores registrado
   * antes de una ruta no cubre esa ruta, y el 404 se tragaria la documentacion.
   */
  configureErrorHandling() {
    this.app.use(notFoundHandler);
    this.app.use(errorHandler);
  }

  async run() {
    await this.configureMiddleware();
    await this.configureRoutes();

    // La documentación describe la superficie entera de la API, incluidos los
    // esquemas de entrada: fuera de desarrollo se publica sólo si se pide.
    const envs: IEnvs = container.resolve(TOKENS.IEnvs);
    if (areDocsEnabled(envs)) {
      await this.configureScalar();
      await this.configureSwagger();
    }

    this.configureErrorHandling();

    const docsEnabled = areDocsEnabled(envs);
    const logger: ILogger = container.resolve(TOKENS.ILogger);

    this.httpServer = this.app.listen(this.port, () => {
      const base = `http://localhost:${this.port}`;
      logger.info("Servidor escuchando", {
        port: this.port,
        ui: `${base}/`,
        users: `${base}/api/users`,
        // No se anuncia lo que no está montado: con la documentación apagada
        // estas dos direcciones darían un 404.
        swagger: docsEnabled ? `${base}/api/swagger` : undefined,
        scalar: docsEnabled ? `${base}/api/scalar` : undefined,
        health: `${base}/health/ready`,
      });
    });
  }

  /** Dirección en la que quedó escuchando, o `null` si no está escuchando. */
  get address(): AddressInfo | null {
    const address = this.httpServer?.address();
    return address && typeof address !== "string" ? address : null;
  }

  /**
   * Deja de aceptar conexiones y espera a que terminen las peticiones en vuelo.
   *
   * `close()` por sí solo no basta: con keep-alive, un cliente ocioso mantiene
   * su conexión abierta y la promesa no se resolvería hasta que él la cierre.
   * `closeIdleConnections()` suelta justo esas —las que no tienen petición en
   * curso— y deja terminar a las que sí.
   */
  async close(): Promise<void> {
    const server = this.httpServer;
    if (!server) return;

    this.httpServer = undefined;

    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
      server.closeIdleConnections();
    });
  }
}
