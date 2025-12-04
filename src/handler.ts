import "reflect-metadata";
import "./core/di/container";
import serverlessExpress from "serverless-http";
import { Server } from "./core/server";

const server = new Server();
let cachedHandler: any;

async function bootstrap() {
  if (!cachedHandler) {
    await server.init();
    cachedHandler = serverlessExpress(server.app);
  }

  return cachedHandler;
}

export const handler = async (event: any, context: any) => {
  const appHandler = await bootstrap();
  return appHandler(event, context);
};
