import "reflect-metadata";
import {
  resolveUsersDataSource,
  USERS_DATASOURCES,
} from "../../../../src/core/di/datasource.factory";
import { UsersGenericDataSource } from "../../../../src/infrastructure/datasources/generic/users.generic.datasource";
import { UsersSqlServerDataSource } from "../../../../src/infrastructure/datasources/sqlserver/users.sqlserver.datasource";

describe("resolveUsersDataSource", () => {
  it("defaults to the generic datasource when no value is provided", () => {
    expect(resolveUsersDataSource(undefined)).toBe(UsersGenericDataSource);
    expect(resolveUsersDataSource("")).toBe(UsersGenericDataSource);
  });

  it("returns the generic datasource for 'dummy'", () => {
    expect(resolveUsersDataSource("dummy")).toBe(UsersGenericDataSource);
  });

  // dummy y oracle comparten implementación: el repositorio genérico es el que
  // cambia (memoria u Oracle), no el datasource.
  it("returns the generic datasource for 'oracle'", () => {
    expect(resolveUsersDataSource("oracle")).toBe(UsersGenericDataSource);
  });

  it("returns the SQL Server datasource for 'sqlserver'", () => {
    expect(resolveUsersDataSource("sqlserver")).toBe(UsersSqlServerDataSource);
  });

  it("is case-insensitive", () => {
    expect(resolveUsersDataSource("SqlServer")).toBe(UsersSqlServerDataSource);
    expect(resolveUsersDataSource("ORACLE")).toBe(UsersGenericDataSource);
    expect(resolveUsersDataSource("DUMMY")).toBe(UsersGenericDataSource);
  });

  it("throws a descriptive error for an unknown datasource", () => {
    expect(() => resolveUsersDataSource("mongodb")).toThrow(
      /Unknown DATA_SOURCE "mongodb"/
    );
    expect(() => resolveUsersDataSource("mongodb")).toThrow(/dummy, oracle, sqlserver/);
  });

  it("exposes the available implementations", () => {
    expect(Object.keys(USERS_DATASOURCES).sort()).toEqual(["dummy", "oracle", "sqlserver"]);
  });
});
