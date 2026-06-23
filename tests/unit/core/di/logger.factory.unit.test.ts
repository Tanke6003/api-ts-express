import "reflect-metadata";
import { createLogger } from "../../../../src/core/di/logger.factory";
import { PinoLoggerPlugin } from "../../../../src/infrastructure/plugins/pino.plugin";
import { WinstonPlugin } from "../../../../src/infrastructure/plugins/winston.plugin";
import { IEnvs } from "../../../../src/domain/interfaces/infrastructure/plugins/envs.plugin.interface";

jest.mock("../../../../src/infrastructure/plugins/pino.plugin");
jest.mock("../../../../src/infrastructure/plugins/winston.plugin");

function envsFrom(values: Record<string, string>): IEnvs {
  return { getEnv: (key: string) => values[key] ?? "" };
}

describe("createLogger", () => {
  beforeEach(() => jest.clearAllMocks());

  it("defaults to Pino when LOG_DRIVER is not set", () => {
    const logger = createLogger(envsFrom({}));
    expect(PinoLoggerPlugin).toHaveBeenCalledTimes(1);
    expect(WinstonPlugin).not.toHaveBeenCalled();
    expect(logger).toBeInstanceOf(PinoLoggerPlugin);
  });

  it("returns Pino for LOG_DRIVER=pino", () => {
    const logger = createLogger(envsFrom({ LOG_DRIVER: "pino" }));
    expect(PinoLoggerPlugin).toHaveBeenCalled();
    expect(logger).toBeInstanceOf(PinoLoggerPlugin);
  });

  it("returns Winston for LOG_DRIVER=winston and forwards level/service", () => {
    const logger = createLogger(
      envsFrom({ LOG_DRIVER: "winston", LOG_LEVEL: "info", SERVICE_NAME: "svc" })
    );
    expect(WinstonPlugin).toHaveBeenCalledWith({ level: "info", service: "svc" });
    expect(logger).toBeInstanceOf(WinstonPlugin);
  });

  it("is case-insensitive for the driver name", () => {
    createLogger(envsFrom({ LOG_DRIVER: "WINSTON" }));
    expect(WinstonPlugin).toHaveBeenCalled();
  });

  it("throws a descriptive error for an unknown LOG_DRIVER", () => {
    expect(() => createLogger(envsFrom({ LOG_DRIVER: "bunyan" }))).toThrow(
      /Unknown LOG_DRIVER "bunyan"/
    );
  });
});
