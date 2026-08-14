import { BranchesService } from "../../../src/application/services/branches.service";
import { ENTITY_NAMES } from "../../../src/domain/models/entity-names";
import { IBranch } from "../../../src/domain/models/branches.model";

const branch = (over: Partial<IBranch> = {}): IBranch => ({
  pkBranch: 1,
  name: "Sucursal Centro",
  address: "Av. Juárez 100",
  phone: "+52 55 5000 0001",
  opensAt: "09:00",
  closesAt: "19:00",
  available: true,
  ...over,
});

describe("BranchesService", () => {
  let repository: any;
  let scopedBranches: any;
  let scopedAppointments: any;
  let unitOfWork: any;
  let logger: any;
  let service: BranchesService;

  beforeEach(() => {
    repository = {
      getPaged: jest.fn(),
      getById: jest.fn(),
      insert: jest.fn(),
      update: jest.fn(),
      restore: jest.fn(),
    };

    scopedBranches = { softDelete: jest.fn(), hardDelete: jest.fn() };
    scopedAppointments = { updateWhere: jest.fn().mockResolvedValue(0), hardDeleteWhere: jest.fn().mockResolvedValue(0) };

    // La unidad de trabajo real abre una transacción; aquí sólo se comprueba que
    // el servicio pide los repositorios correctos y los usa dentro del bloque.
    unitOfWork = {
      execute: jest.fn((work: any) =>
        work({
          repository: (entity: string) =>
            entity === ENTITY_NAMES.BRANCHES ? scopedBranches : scopedAppointments,
          lockRow: jest.fn().mockResolvedValue(true),
        })
      ),
    };

    logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    service = new BranchesService(repository, unitOfWork, logger);
  });

  describe("getAll", () => {
    it("mapea la página a DTOs", async () => {
      repository.getPaged.mockResolvedValue({
        items: [branch()],
        total: 1,
        page: 1,
        limit: 10,
        pages: 1,
      });

      const result = await service.getAll({ page: 1, limit: 10 });

      expect(result.data).toEqual([
        {
          id: 1,
          name: "Sucursal Centro",
          address: "Av. Juárez 100",
          phone: "+52 55 5000 0001",
          opensAt: "09:00",
          closesAt: "19:00",
          available: true,
        },
      ]);
      expect(result).toMatchObject({ total: 1, page: 1, limit: 10, pages: 1 });
    });

    it("busca en nombre y dirección con un OR, ignorando mayúsculas", async () => {
      repository.getPaged.mockResolvedValue({ items: [], total: 0, page: 1, limit: 10, pages: 0 });

      await service.getAll({ page: 1, limit: 10, search: "norte" });

      expect(repository.getPaged).toHaveBeenCalledWith(1, 10, {
        where: {
          $or: [{ name: { contains: "norte" } }, { address: { contains: "norte" } }],
        },
        withDeleted: undefined,
        orderBy: { field: "name", direction: "asc" },
      });
    });

    it("sin búsqueda no manda filtro", async () => {
      repository.getPaged.mockResolvedValue({ items: [], total: 0, page: 1, limit: 10, pages: 0 });

      await service.getAll({ page: 1, limit: 10, withDeleted: true });

      expect(repository.getPaged.mock.calls[0][2]).toMatchObject({
        where: undefined,
        withDeleted: true,
      });
    });
  });

  describe("getById", () => {
    it("devuelve el DTO o null", async () => {
      repository.getById.mockResolvedValueOnce(branch());
      expect(await service.getById(1)).toMatchObject({ id: 1 });

      repository.getById.mockResolvedValueOnce(null);
      expect(await service.getById(9)).toBeNull();
    });
  });

  describe("create / update", () => {
    it("crea con una sola sentencia, sin transacción", async () => {
      repository.insert.mockResolvedValue(branch({ pkBranch: 7 }));

      const created = await service.create({ name: "Nueva" });

      expect(created.id).toBe(7);
      expect(unitOfWork.execute).not.toHaveBeenCalled();
    });

    it("rechaza un horario de cierre anterior al de apertura", async () => {
      await expect(
        service.create({ name: "Mala", opensAt: "19:00", closesAt: "09:00" })
      ).rejects.toMatchObject({ statusCode: 400 });

      expect(repository.insert).not.toHaveBeenCalled();
    });

    it("valida el horario combinando lo enviado con lo ya guardado", async () => {
      repository.getById.mockResolvedValue(branch({ opensAt: "09:00", closesAt: "19:00" }));

      // Sólo llega el cierre, pero se contrasta contra la apertura existente.
      await expect(service.update(1, { closesAt: "08:00" })).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it("actualiza sólo los campos presentes", async () => {
      repository.getById.mockResolvedValue(branch());
      repository.update.mockResolvedValue(branch({ name: "Renombrada" }));

      const updated = await service.update(1, { name: "Renombrada" });

      expect(repository.update).toHaveBeenCalledWith(1, { name: "Renombrada" });
      expect(updated?.name).toBe("Renombrada");
    });

    it("devuelve null si la sucursal no existe", async () => {
      repository.getById.mockResolvedValue(null);
      expect(await service.update(99, { name: "X" })).toBeNull();
    });

    it("devuelve null si el update no encuentra la fila", async () => {
      repository.getById.mockResolvedValue(branch());
      repository.update.mockResolvedValue(null);

      expect(await service.update(1, { name: "X" })).toBeNull();
    });
  });

  describe("softDelete", () => {
    it("da de baja la sucursal y cancela sus citas futuras en la misma transacción", async () => {
      scopedBranches.softDelete.mockResolvedValue(true);
      scopedAppointments.updateWhere.mockResolvedValue(2);

      expect(await service.softDelete(1)).toBe(true);
      expect(unitOfWork.execute).toHaveBeenCalledTimes(1);

      const [where, changes] = scopedAppointments.updateWhere.mock.calls[0];
      expect(changes).toEqual({ status: "CANCELLED" });
      expect(where.$and[0]).toEqual({ fkBranch: 1 });
      expect(where.$and[1].scheduledAt.gte).toBeInstanceOf(Date);
      // Las ya canceladas o atendidas se quedan como están.
      expect(where.$and[2]).toEqual({ status: { notIn: ["CANCELLED", "DONE"] } });
    });

    it("si la sucursal no existía no toca las citas", async () => {
      scopedBranches.softDelete.mockResolvedValue(false);

      expect(await service.softDelete(1)).toBe(false);
      expect(scopedAppointments.updateWhere).not.toHaveBeenCalled();
    });
  });

  describe("hardDelete", () => {
    it("borra primero las citas y luego la sucursal", async () => {
      scopedBranches.hardDelete.mockResolvedValue(true);
      scopedAppointments.hardDeleteWhere.mockResolvedValue(3);

      expect(await service.hardDelete(1)).toBe(true);

      expect(scopedAppointments.hardDeleteWhere).toHaveBeenCalledWith({ fkBranch: 1 });
      // El orden importa: la FK impide borrar la sucursal antes que sus citas.
      const appointmentsCall = scopedAppointments.hardDeleteWhere.mock.invocationCallOrder[0];
      const branchCall = scopedBranches.hardDelete.mock.invocationCallOrder[0];
      expect(appointmentsCall).toBeLessThan(branchCall);
    });

    it("lanza 404 —y con ello revierte— si la sucursal no existía", async () => {
      scopedBranches.hardDelete.mockResolvedValue(false);

      await expect(service.hardDelete(99)).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  it("restore delega en el repositorio sin tocar las citas", async () => {
    repository.restore.mockResolvedValue(true);

    expect(await service.restore(1)).toBe(true);
    expect(unitOfWork.execute).not.toHaveBeenCalled();
  });
});
