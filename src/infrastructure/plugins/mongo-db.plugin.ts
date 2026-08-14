// src/infrastructure/plugins/mongo-db.plugin.ts
import { ClientSession, Collection, Db, Document, MongoClient } from "mongodb";
import type {
  DbEngine,
  IDbPlugin,
} from "../../domain/interfaces/infrastructure/plugins/db.plugin.interface";
import type { ILogger } from "../../domain/interfaces/infrastructure/plugins/logger.plugin.interface";

export interface MongoConnectionConfig {
  host: string;
  port: number;
  database: string;
  /**
   * Credenciales opcionales: a diferencia de los cuatro motores SQL, el
   * contenedor de desarrollo (`docker compose up mongo`) corre sin
   * autenticación, así que lo normal en local es no tener ninguna.
   */
  username?: string;
  password?: string;
}

function toMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Conector de MongoDB sobre el driver oficial `mongodb`.
 *
 * Implementa `IDbPlugin` —y no `ISqlDbPlugin`— porque aquí no hay sentencias que
 * ejecutar: lo que consume el repositorio genérico es una colección y una
 * sesión. Esa es justo la frontera que describe `db.plugin.interface.ts`: el
 * ciclo de vida se comparte con los motores SQL, la forma de hablar con la base
 * no.
 *
 * El cliente se crea de forma perezosa y memoizada, igual que el pool de
 * `OraclePlugin`: la primera operación que llegue lo abre y el resto espera esa
 * misma promesa, de modo que un arranque con varias peticiones en paralelo no
 * abre varios clientes.
 */
export class MongoDbPlugin implements IDbPlugin {
  readonly engine: DbEngine = "mongodb";

  private client: MongoClient | null = null;
  private pending: Promise<MongoClient> | null = null;
  private closed = false;

  constructor(
    private readonly config: MongoConnectionConfig,
    private readonly logger: ILogger
  ) {}

  // -------------------------------------------------------------- cliente ---

  /**
   * URI de conexión.
   *
   * Usuario y contraseña se codifican: una clave con `@`, `:` o `/` —perfectamente
   * legal— partiría la URI por donde no debe y el driver acabaría buscando otro
   * host. Sin credenciales no se escribe la parte de autenticación en absoluto,
   * que es lo que espera un mongod abierto.
   */
  private buildUri(): string {
    const { host, port, database, username, password } = this.config;
    const credentials = username
      ? `${encodeURIComponent(username)}:${encodeURIComponent(password ?? "")}@`
      : "";

    return `mongodb://${credentials}${host}:${port}/${database}`;
  }

  private getClient(): Promise<MongoClient> {
    if (this.client) return Promise.resolve(this.client);
    if (this.closed) throw new Error("[MongoDbPlugin] El cliente ya fue cerrado.");

    if (!this.pending) {
      const client = new MongoClient(this.buildUri(), {
        // El usuario administrador de la imagen oficial vive en `admin`, no en
        // la base de la aplicación; sin credenciales la opción no se usa.
        ...(this.config.username ? { authSource: "admin" } : {}),
      });

      this.pending = client
        .connect()
        .then((connected) => {
          this.client = connected;
          this.logger.info("Cliente de MongoDB creado", {
            host: this.config.host,
            port: this.config.port,
            database: this.config.database,
          });
          return connected;
        })
        .catch((err) => {
          // Sin esto, un fallo transitorio (la réplica todavía eligiendo
          // primario) dejaría la promesa rechazada cacheada para siempre.
          this.pending = null;
          this.logger.error("No se pudo conectar con MongoDB", { err: toMessage(err) });
          throw new Error(`[MongoDbPlugin] connect failed: ${toMessage(err)}`, { cause: err });
        });
    }

    return this.pending;
  }

  private async database(): Promise<Db> {
    return (await this.getClient()).db(this.config.database);
  }

  /**
   * Colección por nombre. Es todo lo que el repositorio genérico necesita del
   * conector para leer y escribir; el mapeo documento <-> entidad es cosa suya.
   */
  async collection<TDoc extends Document = Document>(name: string): Promise<Collection<TDoc>> {
    return (await this.database()).collection<TDoc>(name);
  }

  async authenticate(): Promise<void> {
    try {
      const database = await this.database();
      await database.command({ ping: 1 });
      this.logger.info("Conexión con MongoDB establecida correctamente.");
    } catch (err) {
      this.logger.error("No fue posible conectar con MongoDB", { err: toMessage(err) });
      throw new Error(`[MongoDbPlugin] authenticate failed: ${toMessage(err)}`, { cause: err });
    }
  }

  /**
   * Ejecuta `work` dentro de una transacción multi-documento: commit al
   * terminar, rollback si lanza.
   *
   * `withTransaction` reintenta la operación ante errores transitorios del
   * servidor, así que `work` puede ejecutarse más de una vez y no debe llevar
   * efectos fuera de la base. La sesión se cierra siempre, también si el bloque
   * revienta, para no dejarla colgada en el servidor.
   *
   * Requiere que el mongod corra como réplica —de ahí el `--replSet rs0` del
   * docker-compose—: un nodo suelto no tiene oplog y rechaza la transacción.
   */
  async transaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
    const client = await this.getClient();
    const session = client.startSession();

    try {
      return await session.withTransaction((active) => work(active));
    } catch (err) {
      this.logger.error("Transacción revertida", { err: toMessage(err) });
      throw err;
    } finally {
      await session.endSession();
    }
  }

  async close(): Promise<void> {
    if (!this.client) return;

    await this.client.close();
    this.client = null;
    this.pending = null;
    this.closed = true;
    this.logger.info("Cliente de MongoDB cerrado.");
  }
}
