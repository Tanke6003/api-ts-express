// tests/e2e/support/api.ts
//
// Arranque compartido de los e2e: la aplicación entera montada sobre el driver
// en memoria, sin Docker y sin base, así que corre igual en CI que en local.
import "reflect-metadata";
import "../../../src/core/di/container";
import request from "supertest";
import type { Application } from "express";
import { container } from "tsyringe";
import { Server } from "../../../src/core/server";
import type { IEnvs } from "../../../src/domain/interfaces/infrastructure/plugins/envs.plugin.interface";

export interface ApiUnderTest {
  app: Application;
  /** Cabecera lista para usar: `.set("Authorization", auth)`. */
  auth: string;
}

/** Fecha futura en ISO, para agendar sin depender del reloj del que corre. */
export const future = (hours: number): string =>
  new Date(Date.now() + hours * 3600_000).toISOString();

/**
 * Monta la API y saca un token.
 *
 * Sin `run()`: no hay que escuchar en un puerto para hablar con la aplicación
 * por supertest, y así dos suites pueden correr a la vez sin pelearse.
 */
export async function bootstrap(userId = "7", name = "Ruben"): Promise<ApiUnderTest> {
  const envs = container.resolve<IEnvs>("IEnvs");
  const server = new Server(Number(envs.getEnv("PORT") || 4002));

  await server.configureMiddleware();
  await server.configureRoutes();
  server.configureErrorHandling();

  const { body } = await request(server.app).get(
    `/api/generate-token?userId=${userId}&name=${name}`
  );

  return { app: server.app, auth: `Bearer ${body.token}` };
}
