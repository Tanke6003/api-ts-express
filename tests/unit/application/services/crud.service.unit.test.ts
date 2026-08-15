// tests/unit/application/crud.service.unit.test.ts
import { CrudService } from "../../../../src/application/services/crud.service";
import type { IGenericRepository } from "../../../../src/domain/interfaces/infrastructure/repositories/generic.repository.interface";

interface Item {
  pkItem: number;
  name: string;
}
interface ItemDTO {
  id: number;
  name: string;
}

const mapper = {
  toDTO: (e: Item): ItemDTO => ({ id: e.pkItem, name: e.name }),
  toDTOList: (e: Item[]): ItemDTO[] => e.map((i) => ({ id: i.pkItem, name: i.name })),
  toEntity: (d: Partial<ItemDTO>): Partial<Item> => ({ name: d.name }),
  toPartialEntity: (d: Partial<ItemDTO>): Partial<Item> =>
    d.name === undefined ? {} : { name: d.name },
};

class ItemsService extends CrudService<Item, ItemDTO> {
  constructor(repository: IGenericRepository<Item>) {
    super(repository, mapper, { field: "pkItem", direction: "asc" });
  }
}

describe("CrudService", () => {
  let repository: jest.Mocked<Pick<
    IGenericRepository<Item>,
    "getPaged" | "getById" | "insert" | "update" | "softDelete"
  >>;
  let service: ItemsService;

  beforeEach(() => {
    repository = {
      getPaged: jest.fn(),
      getById: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
    } as never;
    service = new ItemsService(repository as never);
  });

  describe("list", () => {
    it("mapea la página a DTOs y conserva los totales", async () => {
      repository.getPaged.mockResolvedValue({
        items: [{ pkItem: 1, name: "uno" }],
        total: 1,
        page: 1,
        limit: 10,
        pages: 1,
      });

      await expect(service.list(1, 10)).resolves.toEqual({
        data: [{ id: 1, name: "uno" }],
        total: 1,
        page: 1,
        limit: 10,
        pages: 1,
      });
    });

    it("aplica el orden por defecto del módulo", async () => {
      repository.getPaged.mockResolvedValue({ items: [], total: 0, page: 1, limit: 10, pages: 0 });

      await service.list(2, 5, { withDeleted: true });

      expect(repository.getPaged).toHaveBeenCalledWith(2, 5, {
        where: undefined,
        withDeleted: true,
        orderBy: { field: "pkItem", direction: "asc" },
      });
    });
  });

  describe("get", () => {
    it("devuelve el DTO, o null si no existe", async () => {
      repository.getById.mockResolvedValueOnce({ pkItem: 3, name: "tres" });
      await expect(service.get(3)).resolves.toEqual({ id: 3, name: "tres" });

      repository.getById.mockResolvedValueOnce(null);
      await expect(service.get(9)).resolves.toBeNull();
    });
  });

  describe("create", () => {
    it("devuelve el recurso ya con su PK", async () => {
      repository.insert.mockResolvedValue({ pkItem: 7, name: "nuevo" });

      await expect(service.create({ name: "nuevo" })).resolves.toEqual({ id: 7, name: "nuevo" });
      // La PK no viaja hacia la entidad: la genera la base.
      expect(repository.insert).toHaveBeenCalledWith({ name: "nuevo" });
    });
  });

  describe("update", () => {
    it("manda sólo las claves presentes", async () => {
      repository.update.mockResolvedValue({ pkItem: 1, name: "otro" });

      await service.update(1, { name: "otro" });
      expect(repository.update).toHaveBeenCalledWith(1, { name: "otro" });

      // Un PUT vacío no debe borrar lo que nadie pidió cambiar.
      await service.update(1, {});
      expect(repository.update).toHaveBeenLastCalledWith(1, {});
    });

    it("devuelve null si la fila no existe", async () => {
      repository.update.mockResolvedValue(null);
      await expect(service.update(99, { name: "x" })).resolves.toBeNull();
    });
  });

  it("softDelete delega y devuelve si tocó alguna fila", async () => {
    repository.softDelete.mockResolvedValue(false);
    await expect(service.softDelete(1)).resolves.toBe(false);
    expect(repository.softDelete).toHaveBeenCalledWith(1);
  });
});
