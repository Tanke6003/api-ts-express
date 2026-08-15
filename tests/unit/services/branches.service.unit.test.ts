// tests/unit/services/branches.service.unit.test.ts
//
// Sólo lo que sucursales **añade** al CRUD genérico: el filtro de búsqueda, la
// validación del horario y las dos bajas que arrastran la agenda. Paginar,
// mapear a DTO o devolver null cuando no hay fila es de `CrudService` y se
// prueba allí; repetirlo aquí sería probar el framework a través del módulo.
import { BranchesService } from "../../../src/application/services/branches.service";
import { ENTITY_NAMES } from "../../../src/domain/models/entity-names";
import { IBranch } from "../../../src/domain/models/branches.model";

const branch = (over: Partial<IBranch> = {}): IBranch => ({
  pkBranch: 1,
  name: "Sucursal Centro",
  address: "Av. Juárez 100",
  opensAt: "09:00",
  closesAt: "19:00",
  available: true,
  ...over,
});

describe("BranchesService", () => {
  let repository: any;
  let appointmentsRepository: any;
  let lockRow: jest.Mock;
  let transactions: any;
  let unitOfWork: any;
  let logger: any;
  let service: BranchesService;

  beforeEach(() => {
    repository = {
      getPaged: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 10, pages: 0 }),
      getById: jest.fn(),
      insert: jest.fn().mockResolvedValue(branch()),
      update: jest.fn().mockResolvedValue(branch()),
      softDelete: jest.fn(),
      hardDelete: jest.fn(),
      restore: jest.fn(),
    };

    appointmentsRepository = {
      updateWhere: jest.fn().mockResolvedValue(0),
      hardDeleteWhere: jest.fn().mockResolvedValue(0),
    };

    lockRow = jest.fn().mockResolvedValue(true);
    const scope = { repository: jest.fn(), lockRow };

    let active: unknown;
    transactions = { current: () => active, run: (_s: unknown, fn: any) => fn() };
    unitOfWork = {
      execute: jest.fn(async (work: any) => {
        active = scope;
        try {
          return await work(scope);
        } finally {
          active = undefined;
        }
      }),
    };

    logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    service = new BranchesService(
      repository,
      appointmentsRepository,
      unitOfWork,
      transactions,
      logger
    );
  });

  describe("búsqueda", () => {
    it("el término busca a la vez en nombre y dirección", async () => {
      await service.list(1, 10, { query: { page: 1, limit: 10, search: "norte" } });

      expect(repository.getPaged.mock.calls[0][2].where).toEqual({
        $or: [{ name: { contains: "norte" } }, { address: { contains: "norte" } }],
      });
    });

    it("sin término no manda filtro", async () => {
      await service.list(1, 10, { query: { page: 1, limit: 10 } });

      expect(repository.getPaged.mock.calls[0][2].where).toBeUndefined();
    });
  });

  describe("horario", () => {
    it("rechaza un cierre anterior a la apertura al crear", async () => {
      await expect(
        service.create({ name: "Mala", opensAt: "19:00", closesAt: "09:00" })
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(repository.insert).not.toHaveBeenCalled();
    });

    it("al actualizar valida lo enviado contra lo ya guardado", async () => {
      repository.getById.mockResolvedValue(branch({ opensAt: "09:00", closesAt: "19:00" }));

      // Sólo llega el cierre; se contrasta con la apertura que ya estaba.
      await expect(service.update(1, { closesAt: "08:00" })).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it("devuelve null si la sucursal no existe, sin validar nada", async () => {
      repository.getById.mockResolvedValue(null);

      await expect(service.update(99, { closesAt: "08:00" })).resolves.toBeNull();
      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  describe("softDelete", () => {
    it("da de baja y cancela sus citas futuras en la misma transacción", async () => {
      repository.softDelete.mockResolvedValue(true);
      appointmentsRepository.updateWhere.mockResolvedValue(2);

      expect(await service.softDelete(1)).toBe(true);

      expect(unitOfWork.execute).toHaveBeenCalledTimes(1);
      expect(lockRow).toHaveBeenCalledWith(ENTITY_NAMES.BRANCHES, 1);

      const [where, changes] = appointmentsRepository.updateWhere.mock.calls[0];
      expect(changes).toEqual({ status: "CANCELLED" });
      expect(where.$and[0]).toEqual({ fkBranch: 1 });
      expect(where.$and[1].scheduledAt.gte).toBeInstanceOf(Date);
      // Las ya canceladas o atendidas se quedan como están.
      expect(where.$and[2]).toEqual({ status: { notIn: ["CANCELLED", "DONE"] } });
    });

    it("si la sucursal no existía no toca las citas", async () => {
      repository.softDelete.mockResolvedValue(false);

      expect(await service.softDelete(1)).toBe(false);
      expect(appointmentsRepository.updateWhere).not.toHaveBeenCalled();
    });
  });

  describe("hardDelete", () => {
    it("borra primero las citas y luego la sucursal", async () => {
      repository.hardDelete.mockResolvedValue(true);
      appointmentsRepository.hardDeleteWhere.mockResolvedValue(3);

      expect(await service.hardDelete(1)).toBe(true);
      expect(appointmentsRepository.hardDeleteWhere).toHaveBeenCalledWith({ fkBranch: 1 });

      // El orden importa: la FK impide borrar la sucursal antes que sus citas.
      const citas = appointmentsRepository.hardDeleteWhere.mock.invocationCallOrder[0];
      const sucursal = repository.hardDelete.mock.invocationCallOrder[0];
      expect(citas).toBeLessThan(sucursal);
    });

    it("lanza 404 —y con ello revierte— si la sucursal no existía", async () => {
      repository.hardDelete.mockResolvedValue(false);

      await expect(service.hardDelete(99)).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  it("restore no descancela las citas: eso se reagenda a mano", async () => {
    repository.restore.mockResolvedValue(true);

    expect(await service.restore(1)).toBe(true);
    expect(appointmentsRepository.updateWhere).not.toHaveBeenCalled();
  });
});
