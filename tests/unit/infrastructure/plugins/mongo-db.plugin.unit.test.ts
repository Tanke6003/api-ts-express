import { MongoClient } from "mongodb";
import { MongoDbPlugin } from "../../../../src/infrastructure/plugins/mongo-db.plugin";

// El driver real abriría una conexión de verdad; aquí sólo interesa comprobar
// qué le pide el plugin y cómo traduce sus respuestas.
jest.mock("mongodb", () => ({ MongoClient: jest.fn() }));

const CONFIG = { host: "localhost", port: 27017, database: "testdb" };

const logger = {
  log: jest.fn(),
  http: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
} as never;

describe("MongoDbPlugin", () => {
   
  let database: any;
  let session: any;
  let client: any;

  beforeEach(() => {
    jest.clearAllMocks();

    database = {
      command: jest.fn().mockResolvedValue({ ok: 1 }),
      collection: jest.fn((name: string) => ({ name })),
    };
    session = {
      withTransaction: jest.fn((work: (s: unknown) => Promise<unknown>) => work(session)),
      endSession: jest.fn(),
    };
    client = {
      connect: jest.fn().mockImplementation(() => Promise.resolve(client)),
      db: jest.fn().mockReturnValue(database),
      startSession: jest.fn().mockReturnValue(session),
      close: jest.fn(),
    };

    (MongoClient as unknown as jest.Mock).mockImplementation(() => client);
  });

  const plugin = (config = CONFIG) => new MongoDbPlugin(config, logger);
  const uriOf = () => (MongoClient as unknown as jest.Mock).mock.calls[0][0] as string;
  const optionsOf = () => (MongoClient as unknown as jest.Mock).mock.calls[0][1] as Record<string, unknown>;

  describe("identidad", () => {
    it("se anuncia como mongodb, que es el valor de DATA_SOURCE", () => {
      expect(plugin().engine).toBe("mongodb");
    });
  });

  describe("cliente", () => {
    it("se crea de forma perezosa y una sola vez", async () => {
      const mongo = plugin();
      expect(MongoClient).not.toHaveBeenCalled();

      await Promise.all([mongo.collection("USERS"), mongo.collection("BRANCHES")]);

      // Dos operaciones en paralelo esperan la misma promesa de conexión: si no,
      // el arranque abriría varios clientes.
      expect(MongoClient).toHaveBeenCalledTimes(1);
      expect(client.connect).toHaveBeenCalledTimes(1);
    });

    it("sin credenciales la URI no lleva parte de autenticación", async () => {
      await plugin().authenticate();

      expect(uriOf()).toBe("mongodb://localhost:27017/testdb");
      expect(optionsOf()).toEqual({});
    });

    it("con credenciales las codifica y autentica contra admin", async () => {
      // Una contraseña con `@` o `/` partiría la URI por donde no debe.
      await plugin({ ...CONFIG, username: "app user", password: "p@ss/word" }).authenticate();

      expect(uriOf()).toBe("mongodb://app%20user:p%40ss%2Fword@localhost:27017/testdb");
      expect(optionsOf()).toEqual({ authSource: "admin" });
    });

    it("no cachea una conexión fallida: un fallo transitorio se puede reintentar", async () => {
      client.connect
        .mockRejectedValueOnce(new Error("réplica sin primario"))
        .mockImplementation(() => Promise.resolve(client));

      const mongo = plugin();
      await expect(mongo.authenticate()).rejects.toThrow(/connect failed/);
      await expect(mongo.authenticate()).resolves.toBeUndefined();
    });

    it("envuelve el fallo conservando la causa, que es lo que recorre el manejador global", async () => {
      const causa = new Error("ECONNREFUSED");
      client.connect.mockRejectedValueOnce(causa);

      await expect(plugin().collection("USERS")).rejects.toMatchObject({ cause: causa });
    });
  });

  describe("authenticate", () => {
    it("comprueba la base con un ping", async () => {
      await plugin().authenticate();

      expect(database.command).toHaveBeenCalledWith({ ping: 1 });
    });

    it("envuelve el fallo del ping", async () => {
      database.command.mockRejectedValueOnce(new Error("not authorized"));

      await expect(plugin().authenticate()).rejects.toThrow(/authenticate failed/);
    });
  });

  describe("collection", () => {
    it("resuelve la colección sobre la base configurada", async () => {
      await expect(plugin().collection("USERS")).resolves.toEqual({ name: "USERS" });
      expect(client.db).toHaveBeenCalledWith("testdb");
    });
  });

  describe("transaction", () => {
    it("ejecuta el bloque dentro de la sesión y la cierra siempre", async () => {
      const mongo = plugin();

      const result = await mongo.transaction(async (active) => {
        expect(active).toBe(session);
        return "confirmado";
      });

      expect(result).toBe("confirmado");
      expect(session.withTransaction).toHaveBeenCalledTimes(1);
      expect(session.endSession).toHaveBeenCalledTimes(1);
    });

    it("propaga el error del bloque y cierra la sesión igualmente", async () => {
      session.withTransaction.mockRejectedValueOnce(new Error("transacción abortada"));

      await expect(plugin().transaction(async () => "x")).rejects.toThrow("transacción abortada");
      expect(session.endSession).toHaveBeenCalledTimes(1);
    });
  });

  describe("close", () => {
    it("cierra el cliente y no vuelve a abrirlo después", async () => {
      const mongo = plugin();
      await mongo.authenticate();
      await mongo.close();

      expect(client.close).toHaveBeenCalledTimes(1);
      await expect(mongo.collection("USERS")).rejects.toThrow(/ya fue cerrado/);
    });

    it("cerrar sin haber conectado no hace nada", async () => {
      await expect(plugin().close()).resolves.toBeUndefined();
      expect(client.close).not.toHaveBeenCalled();
    });
  });
});
