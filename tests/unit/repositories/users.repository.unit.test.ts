// tests/unit/repositories/users.repository.unit.test.ts
import { UsersRepository } from "../../../src/infrastructure/repositories/users.repository";
import { MemoryGenericRepository } from "../../../src/infrastructure/repositories/base/drivers/memory.generic.repository";
import { USERS_ENTITY } from "../../../src/infrastructure/repositories/entities";
import { USERS_SEED } from "../../../src/infrastructure/repositories/seed-data";
import { IUser } from "../../../src/domain/models/users.model";
import { ILogger } from "../../../src/domain/interfaces/infrastructure/plugins/logger.plugin.interface";

/**
 * Usuarios ya no tiene datasource propio: el repositorio es el genérico con el
 * contexto del módulo, igual que sucursales y citas.
 */
describe("UsersRepository", () => {
  let store: MemoryGenericRepository<IUser>;
  let logger: jest.Mocked<ILogger>;
  let repository: UsersRepository;

  beforeEach(() => {
    store = new MemoryGenericRepository<IUser>(USERS_ENTITY, USERS_SEED);
    logger = {
      log: jest.fn(),
      http: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as unknown as jest.Mocked<ILogger>;

    repository = new UsersRepository(store, logger);
  });

  it("hereda el CRUD del repositorio genérico", async () => {
    expect(await repository.count()).toBe(4);
    expect(await repository.getById(1)).toMatchObject({ name: "John Doe" });

    const created = await repository.insert({ name: "Nuevo", isClient: true });
    expect(created.pkUser).toBe(5);

    expect(await repository.update(1, { name: "Renombrado" })).toMatchObject({
      name: "Renombrado",
    });
  });

  it("el borrado lógico oculta al usuario pero conserva la fila", async () => {
    expect(await repository.softDelete(1)).toBe(true);

    expect(await repository.getById(1)).toBeNull();
    expect(await repository.getById(1, { withDeleted: true })).not.toBeNull();
  });

  it("pagina con totales", async () => {
    const page = await repository.getPaged(2, 2, { orderBy: { field: "pkUser" } });

    expect(page).toMatchObject({ total: 4, page: 2, limit: 2, pages: 2 });
  });

  // El detalle del driver queda en el log, no en la respuesta HTTP.
  it("traduce el fallo del almacén a un error del repositorio y lo registra", async () => {
    jest.spyOn(store, "getById").mockRejectedValue(new Error("ORA-00942"));

    await expect(repository.getById(1)).rejects.toThrow("UsersRepository.getById failed.");
    expect(logger.error).toHaveBeenCalledWith(
      "Error in UsersRepository.getById",
      expect.objectContaining({ id: 1 })
    );
  });
});
