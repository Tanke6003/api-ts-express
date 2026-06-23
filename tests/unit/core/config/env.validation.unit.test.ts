import { validateCriticalEnvs } from "../../../../src/core/config/env.validation";
import { IEnvs } from "../../../../src/domain/interfaces/infrastructure/plugins/envs.plugin.interface";

function envsFrom(values: Record<string, string>): IEnvs {
  return { getEnv: (key: string) => values[key] ?? "" };
}

describe("validateCriticalEnvs", () => {
  it("passes when JWT_SECRET is present (dummy datasource)", () => {
    expect(() =>
      validateCriticalEnvs(envsFrom({ JWT_SECRET: "secret" }))
    ).not.toThrow();
  });

  it("throws when JWT_SECRET is missing", () => {
    expect(() => validateCriticalEnvs(envsFrom({}))).toThrow(/JWT_SECRET/);
  });

  it("requires DB_PASSWORD when DATA_SOURCE=sqlserver", () => {
    expect(() =>
      validateCriticalEnvs(envsFrom({ JWT_SECRET: "secret", DATA_SOURCE: "sqlserver" }))
    ).toThrow(/DB_PASSWORD/);
  });

  it("passes for sqlserver when DB_PASSWORD is present", () => {
    expect(() =>
      validateCriticalEnvs(
        envsFrom({ JWT_SECRET: "secret", DATA_SOURCE: "sqlserver", DB_PASSWORD: "pw" })
      )
    ).not.toThrow();
  });

  it("does not require DB_PASSWORD for the dummy datasource", () => {
    expect(() =>
      validateCriticalEnvs(envsFrom({ JWT_SECRET: "secret", DATA_SOURCE: "dummy" }))
    ).not.toThrow();
  });

  it("lists every missing secret in a single error", () => {
    expect(() =>
      validateCriticalEnvs(envsFrom({ DATA_SOURCE: "sqlserver" }))
    ).toThrow(/JWT_SECRET, DB_PASSWORD/);
  });
});
