import "reflect-metadata";
import "./core/di/container";
import { handler } from "./handler";

process.env.SERVERLESS = process.env.SERVERLESS ?? "true";
process.env.IS_SERVERLESS = process.env.IS_SERVERLESS ?? "true";
process.env.NODE_ENV = process.env.NODE_ENV ?? "test";

async function main() {
  const response = await handler(
    {
      version: "2.0",
      routeKey: "GET /health",
      rawPath: "/health",
      rawQueryString: "",
      headers: {},
      requestContext: {
        http: {
          method: "GET",
          path: "/health",
          protocol: "HTTP/1.1",
          sourceIp: "127.0.0.1",
          userAgent: "local-cli",
        },
      },
      isBase64Encoded: false,
    } as any,
    {} as any
  );

  // Simple output to verify the handler works end-to-end without levantar un servidor
  console.log("Serverless handler response:", response);
}

main();
