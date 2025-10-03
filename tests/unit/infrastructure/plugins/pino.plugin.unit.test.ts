import pino from "pino";
import pinoHttp from "pino-http";
import { PinoLoggerPlugin } from "../../../../src/infrastructure/plugins/pino.plugin";
import { container } from "tsyringe";
import { IEnvs } from "../../../../src/domain/interfaces/infrastructure/plugins/envs.plugin.interface";

jest.mock("pino", () => {
  const mLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  return Object.assign(
    jest.fn(() => mLogger), // la función constructora
    {
      stdTimeFunctions: { isoTime: jest.fn(() => "2025-10-03T00:00:00.000Z") },
    }
  );
});

jest.mock("pino-http", () => {
  return jest.fn(() => jest.fn((req, res, next) => next()));
});
describe("PinoLoggerPlugin extra branches", () => {
  it("should use default env values when getEnv returns undefined", () => {
    container.reset();
    container.registerInstance<IEnvs>("IEnvs", {
      getEnv: () => undefined,
    });

    const plugin = new PinoLoggerPlugin();
    // Se espera defaults
    expect(pino).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "info",
        base: expect.objectContaining({
          service: "api",
          env: "dev",
          version: "dev",
        }),
      })
    );
  });

  it("should log only msg when meta is undefined", () => {
    const plugin = new PinoLoggerPlugin();
    plugin.info("Just message");
    expect((pino as jest.Mock).mock.results[0].value.info).toHaveBeenCalledWith({
      msg: "Just message",
    });
  });

  it("should log msg merged with meta when meta is provided", () => {
    const plugin = new PinoLoggerPlugin();
    plugin.warn("Warned", { code: 321 });
    expect((pino as jest.Mock).mock.results[0].value.warn).toHaveBeenCalledWith({
      code: 321,
      msg: "Warned",
    });
  });

  it("should extract reqId from x-request-id header", () => {
    const plugin = new PinoLoggerPlugin();
    const req = { method: "GET", url: "/x", headers: { "x-request-id": "req-123" }, socket: {} };
    const res = { statusCode: 200, socket: { remoteAddress: "127.0.0.1" } };
    plugin.http(req, res);
    expect((pinoHttp as jest.Mock).mock.calls[0][0].customProps(req, res)).toMatchObject({
      reqId: "req-123",
    });
  });

  it("should extract reqId from x-amzn-trace-id header if no x-request-id", () => {
    const plugin = new PinoLoggerPlugin();
    const req = { method: "GET", url: "/x", headers: { "x-amzn-trace-id": "trace-999" }, socket: {} };
    const res = { statusCode: 200, socket: { remoteAddress: "127.0.0.1" } };
    expect((pinoHttp as jest.Mock).mock.calls[0][0].customProps(req, res)).toMatchObject({
      reqId: "trace-999",
    });
  });

  it("should extract user-agent header", () => {
    const plugin = new PinoLoggerPlugin();
    const req = { method: "POST", url: "/ua", headers: { "user-agent": "jest-agent" }, socket: {} };
    const res = { statusCode: 200, socket: { remoteAddress: "127.0.0.1" } };
    expect((pinoHttp as jest.Mock).mock.calls[0][0].customProps(req, res)).toMatchObject({
      userAgent: "jest-agent",
    });
  });

  it("should extract ip from x-forwarded-for", () => {
    const plugin = new PinoLoggerPlugin();
    const req = { method: "GET", url: "/", headers: { "x-forwarded-for": "10.0.0.1, 10.0.0.2" }, socket: {} };
    const res = { statusCode: 200, socket: { remoteAddress: "127.0.0.1" } };
    expect((pinoHttp as jest.Mock).mock.calls[0][0].customProps(req, res)).toMatchObject({
      ip: "10.0.0.1",
    });
  });

  it("should fallback ip to socket.remoteAddress", () => {
    const plugin = new PinoLoggerPlugin();
    const req = { method: "GET", url: "/", headers: {}, socket: { remoteAddress: "192.168.0.9" } };
    const res = { statusCode: 200, socket: { remoteAddress: "192.168.0.9" } };
    expect((pinoHttp as jest.Mock).mock.calls[0][0].customProps(req, res)).toMatchObject({
      ip: "192.168.0.9",
    });
  });

  it("should handle customSuccessMessage and customErrorMessage", () => {
    const plugin = new PinoLoggerPlugin();
    const opts = (pinoHttp as jest.Mock).mock.calls[0][0];
    expect(opts.customSuccessMessage()).toBe("http_access");
    expect(opts.customErrorMessage()).toBe("http_error");
  });
});
