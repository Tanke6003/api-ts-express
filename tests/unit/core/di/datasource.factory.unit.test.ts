import "reflect-metadata";
import {
  resolveUsersDataSource,
  USERS_DATASOURCES,
} from "../../../../src/core/di/datasource.factory";
import { UsersDummyDataSource } from "../../../../src/infrastructure/datasources/dummy/users.dummy.datasource";
import { UsersSqlServerDataSource } from "../../../../src/infrastructure/datasources/sqlserver/users.sqlserver.datasource";

describe("resolveUsersDataSource", () => {
  it("defaults to the dummy datasource when no value is provided", () => {
    expect(resolveUsersDataSource(undefined)).toBe(UsersDummyDataSource);
    expect(resolveUsersDataSource("")).toBe(UsersDummyDataSource);
  });

  it("returns the dummy datasource for 'dummy'", () => {
    expect(resolveUsersDataSource("dummy")).toBe(UsersDummyDataSource);
  });

  it("returns the SQL Server datasource for 'sqlserver'", () => {
    expect(resolveUsersDataSource("sqlserver")).toBe(UsersSqlServerDataSource);
  });

  it("is case-insensitive", () => {
    expect(resolveUsersDataSource("SqlServer")).toBe(UsersSqlServerDataSource);
    expect(resolveUsersDataSource("DUMMY")).toBe(UsersDummyDataSource);
  });

  it("throws a descriptive error for an unknown datasource", () => {
    expect(() => resolveUsersDataSource("mongodb")).toThrow(
      /Unknown DATA_SOURCE "mongodb"/
    );
    expect(() => resolveUsersDataSource("mongodb")).toThrow(/dummy, sqlserver/);
  });

  it("exposes the available implementations", () => {
    expect(Object.keys(USERS_DATASOURCES).sort()).toEqual(["dummy", "sqlserver"]);
  });
});
