import { SqlGenericRepository } from "../../../../src/infrastructure/repositories/base/drivers/sql.generic.repository";
import "reflect-metadata";
import {
  buildMongoConfig,
  buildOracleConfig,
  createPersistenceLayer,
  isOracleDriver,
  resolveDriver,
} from "../../../../src/core/di/repository.factory";
import { MemoryGenericRepository } from "../../../../src/infrastructure/repositories/base/drivers/memory.generic.repository";
import { MongoGenericRepository } from "../../../../src/infrastructure/repositories/base/drivers/mongo.generic.repository";
import { ENTITY_NAMES } from "../../../../src/domain/models/entity-names";

const envsWith = (values: Record<string, string>) => ({
  getEnv: (key: string) => values[key] ?? "",
});

const logger = {
  log: jest.fn(),
  http: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
} as never;

describe("isOracleDriver", () => {
  it("sólo 'oracle' activa el driver, sin distinguir mayúsculas", () => {
    expect(isOracleDriver("oracle")).toBe(true);
    expect(isOracleDriver("ORACLE")).toBe(true);
    expect(isOracleDriver("dummy")).toBe(false);
    expect(isOracleDriver("sqlserver")).toBe(false);
    expect(isOracleDriver(undefined)).toBe(false);
    expect(isOracleDriver("")).toBe(false);
  });
});

describe("buildOracleConfig", () => {
  it("usa los valores por defecto alineados con el docker-compose", () => {
    expect(buildOracleConfig(envsWith({}))).toEqual({
      user: "appuser",
      password: "",
      connectString: "localhost:1521/FREEPDB1",
      poolMin: 1,
      poolMax: 10,
      poolIncrement: 1,
    });
  });

  it("respeta lo configurado", () => {
    const config = buildOracleConfig(
      envsWith({
        ORACLE_USER: "otro",
        ORACLE_PASSWORD: "secreto",
        ORACLE_CONNECT_STRING: "db:1521/XEPDB1",
        ORACLE_POOL_MIN: "2",
        ORACLE_POOL_MAX: "20",
        ORACLE_POOL_INCREMENT: "5",
      })
    );

    expect(config).toMatchObject({
      user: "otro",
      password: "secreto",
      connectString: "db:1521/XEPDB1",
      poolMin: 2,
      poolMax: 20,
      poolIncrement: 5,
    });
  });

  // Cero conexiones ociosas es una elección legítima, no un valor inválido.
  it("acepta un mínimo de pool de cero", () => {
    expect(buildOracleConfig(envsWith({ ORACLE_POOL_MIN: "0" }))).toMatchObject({ poolMin: 0 });
    expect(buildOracleConfig(envsWith({ ORACLE_POOL_INCREMENT: "0" }))).toMatchObject({
      poolIncrement: 0,
    });
  });

  it("ignora tamaños de pool inservibles en vez de propagar un NaN", () => {
    const config = buildOracleConfig(
      envsWith({ ORACLE_POOL_MIN: "abc", ORACLE_POOL_MAX: "0", ORACLE_POOL_INCREMENT: "-3" })
    );

    expect(config).toMatchObject({ poolMin: 1, poolMax: 10, poolIncrement: 1 });
  });
});

describe("buildMongoConfig", () => {
  it("usa los valores por defecto alineados con el docker-compose", () => {
    // Sin credenciales: el contenedor de desarrollo corre sin autenticación, y
    // `undefined` es lo que hace que el conector no las escriba en la URI.
    expect(buildMongoConfig(envsWith({}))).toEqual({
      host: "localhost",
      port: 27017,
      database: "testdb",
      username: undefined,
      password: undefined,
    });
  });

  it("respeta lo configurado", () => {
    expect(
      buildMongoConfig(
        envsWith({
          MONGO_HOST: "mongo",
          MONGO_PORT: "27018",
          MONGO_DB: "otra",
          MONGO_USER: "root",
          MONGO_PASSWORD: "secreto",
        })
      )
    ).toEqual({
      host: "mongo",
      port: 27018,
      database: "otra",
      username: "root",
      password: "secreto",
    });
  });

  it("ignora un puerto inservible en vez de propagar un NaN", () => {
    expect(buildMongoConfig(envsWith({ MONGO_PORT: "abc" }))).toMatchObject({ port: 27017 });
  });
});

describe("resolveDriver", () => {
  it("acepta los dos alias de MongoDB", () => {
    expect(resolveDriver("mongodb")).toBe("mongodb");
    expect(resolveDriver("mongo")).toBe("mongodb");
  });

  it("rechaza un DATA_SOURCE desconocido en vez de caer a memoria en silencio", () => {
    // Un `postgress` mal escrito arrancaría en memoria y el fallo aparecería
    // mucho después, en forma de datos que no persisten.
    expect(() => resolveDriver("postgress")).toThrow(/Unknown DATA_SOURCE/);
  });
});

describe("createPersistenceLayer", () => {
  it("en memoria devuelve las tres entidades con su seed", async () => {
    const persistence = createPersistenceLayer(envsWith({ DATA_SOURCE: "dummy" }), logger);

    expect(persistence.driver).toBe("memory");
    expect(persistence.connection).toBeUndefined();
    expect(persistence.stores.users).toBeInstanceOf(MemoryGenericRepository);
    expect(await persistence.stores.users.count()).toBe(4);
    expect(await persistence.stores.branches.count()).toBe(3);
    expect(await persistence.stores.appointments.count()).toBe(4);
  });

  it("la unidad de trabajo en memoria conoce las tres entidades", async () => {
    const persistence = createPersistenceLayer(envsWith({}), logger);

    await persistence.unitOfWork.execute(async (scope) => {
      expect(scope.repository(ENTITY_NAMES.USERS)).toBe(persistence.stores.users);
      expect(scope.repository(ENTITY_NAMES.BRANCHES)).toBe(persistence.stores.branches);
      expect(scope.repository(ENTITY_NAMES.APPOINTMENTS)).toBe(persistence.stores.appointments);
    });
  });

  it("con Oracle construye repositorios sobre el pool sin conectarse todavía", async () => {
    const persistence = createPersistenceLayer(
      envsWith({ DATA_SOURCE: "oracle", ORACLE_PASSWORD: "secreto" }),
      logger
    );

    expect(persistence.driver).toBe("oracle");
    expect(persistence.connection).toBeDefined();
    expect(persistence.stores.users).toBeInstanceOf(SqlGenericRepository);
    expect(persistence.stores.branches).toBeInstanceOf(SqlGenericRepository);
    expect(persistence.stores.appointments).toBeInstanceOf(SqlGenericRepository);
  });

  it("con MongoDB construye repositorios documentales sin conectarse todavía", async () => {
    // El cliente es perezoso: montar la capa no debe abrir ninguna conexión, o
    // los tests y el arranque dependerían de tener el contenedor levantado.
    const persistence = createPersistenceLayer(envsWith({ DATA_SOURCE: "mongodb" }), logger);

    expect(persistence.driver).toBe("mongodb");
    expect(persistence.connection).toBeDefined();
    expect(persistence.stores.users).toBeInstanceOf(MongoGenericRepository);
    expect(persistence.stores.branches).toBeInstanceOf(MongoGenericRepository);
    expect(persistence.stores.appointments).toBeInstanceOf(MongoGenericRepository);
    expect(persistence.stores.auditLog).toBeInstanceOf(MongoGenericRepository);
  });

  it("cada modo tiene su propio almacén: dos capas no comparten estado", async () => {
    const first = createPersistenceLayer(envsWith({}), logger);
    const second = createPersistenceLayer(envsWith({}), logger);

    await first.stores.branches.hardDeleteWhere({});

    expect(await first.stores.branches.count()).toBe(0);
    expect(await second.stores.branches.count()).toBe(3);
  });
});
