describe("serverless handler", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.SERVERLESS = "true";
    process.env.IS_SERVERLESS = "true";
    process.env.NODE_ENV = "test";
    process.env.DISABLE_SCALAR = "true";
    jest.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("responde OK en /health usando el handler serverless", async () => {
    const { handler } = require("../../src/handler");

    const event = {
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
          userAgent: "jest",
        },
      } as any,
      isBase64Encoded: false,
    };

    const response = await handler(event as any, {} as any);

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("OK");
  });
});
