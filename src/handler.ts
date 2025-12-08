import "reflect-metadata";
import "./core/di/container";
import { Server } from "./core/server";
import { createServerlessHandler, LambdaLikeEvent, LambdaLikeResponse } from "./core/serverless-adapter";

const server = new Server();
let cachedHandler: any;

async function bootstrap() {
  if (!cachedHandler) {
    await server.init();
    cachedHandler = createServerlessHandler(server.app);
  }

  return cachedHandler;
}

export const handler = async (event: LambdaLikeEvent, _context: any): Promise<LambdaLikeResponse> => {
  const appHandler = await bootstrap();
  return appHandler(event);
};
