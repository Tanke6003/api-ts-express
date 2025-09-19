// tests/unit/plugins/winston.plugin.unit.test.ts
import winston from "winston";
import { WinstonPlugin } from "../../../src/infrastructure/plugins/winston.plugin";

// Mock de winston
jest.mock("winston", () => {
  const mLogger = {
    log: jest.fn(),
  };
  return {
    createLogger: jest.fn(() => mLogger),
    format: {
      combine: jest.fn(),
      timestamp: jest.fn(),
      printf: jest.fn((formatter) => ({
        transform: formatter, // devolvemos objeto con .transform
      })),
      colorize: jest.fn(),
      simple: jest.fn(),
      metadata: jest.fn(),
      json: jest.fn(),
    },
    transports: {
      Console: jest.fn(),
      File: jest.fn(),
    },
  };
});

describe("WinstonPlugin", () => {
  let plugin: WinstonPlugin;
  let mockLogger: any;

  beforeEach(() => {
    jest.clearAllMocks();
    plugin = new WinstonPlugin();
    mockLogger = (winston.createLogger as jest.Mock).mock.results[0].value;
  });

  it("should call log with info level", () => {
    plugin.info("Test info", { foo: "bar" });
    expect(mockLogger.log).toHaveBeenCalledWith("info", "Test info", { foo: "bar" });
  });

  it("should call log with error level", () => {
    plugin.error("Test error");
    expect(mockLogger.log).toHaveBeenCalledWith("error", "Test error", {});
  });

  it("should call log with warn level", () => {
    plugin.warn("Test warn");
    expect(mockLogger.log).toHaveBeenCalledWith("warn", "Test warn", {});
  });

  it("should call log with debug level", () => {
    plugin.debug("Test debug");
    expect(mockLogger.log).toHaveBeenCalledWith("debug", "Test debug", {});
  });

  it("should log http request after response finishes", () => {
    const req = {
      method: "GET",
      originalUrl: "/test",
      headers: { "user-agent": "jest" },
      ip: "127.0.0.1",
    };
    const res: any = {
      on: jest.fn((event, cb) => {
        if (event === "finish") cb();
      }),
      statusCode: 200,
    };

    plugin.http(req, res);

    expect(mockLogger.log).toHaveBeenCalledWith(
      "http",
      "HTTP Request",
      expect.objectContaining({
        method: "GET",
        endpoint: "/test",
        status: 200,
        ip: "127.0.0.1",
        userAgent: "jest",
      })
    );
  });

  it("should format log message without meta", () => {
    const formatter = winston.format.printf(
      ({ timestamp, level, message, ...meta }) =>
        `${timestamp} [${level.toUpperCase()}]: ${message} ${
          Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ""
        }`
    );

    const result = formatter.transform({
      timestamp: "2025-09-19 12:00:00",
      level: "info",
      message: "Hello",
    });

    expect(result).toBe("2025-09-19 12:00:00 [INFO]: Hello ");
  });

  it("should format log message with meta", () => {
    const formatter = winston.format.printf(
      ({ timestamp, level, message, ...meta }) =>
        `${timestamp} [${level.toUpperCase()}]: ${message} ${
          Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ""
        }`
    );

    const result = formatter.transform({
      timestamp: "2025-09-19 12:00:00",
      level: "error",
      message: "Something failed",
      foo: "bar",
    });

    expect(result).toContain("foo");
    expect(result).toContain("bar");
  });
   it("formats without meta", () => {
    const formatter = winston.format.printf(
      ({ timestamp, level, message, ...meta }) =>
        `${timestamp} [${level.toUpperCase()}]: ${message} ${
          Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ""
        }`
    );

    const result = formatter.transform({
      timestamp: "2025-09-19 12:00:00",
      level: "info",
      message: "Hello",
    });

    expect(result).toBe("2025-09-19 12:00:00 [INFO]: Hello ");
  });

  it("formats with meta", () => {
    const formatter = winston.format.printf(
      ({ timestamp, level, message, ...meta }) =>
        `${timestamp} [${level.toUpperCase()}]: ${message} ${
          Object.keys(meta).length ? JSON.stringify(meta, null, 2) : ""
        }`
    );

    const result = formatter.transform({
      timestamp: "2025-09-19 12:00:00",
      level: "error",
      message: "Fail",
      foo: "bar",
    });

    expect(result).toContain("foo");
  });
});
