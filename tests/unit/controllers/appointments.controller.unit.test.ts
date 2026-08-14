import { AppointmentsController } from "../../../src/presentation/controllers/appointments.controller";

const mockRes = () => {
  const res: any = {};
  res.json = jest.fn().mockReturnValue(res);
  res.status = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

describe("AppointmentsController", () => {
  let service: any;
  let controller: AppointmentsController;
  let res: any;
  let next: jest.Mock;

  beforeEach(() => {
    service = {
      getAll: jest.fn(),
      getById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      hardDelete: jest.fn(),
      restore: jest.fn(),
      getStats: jest.fn(),
    };
    controller = new AppointmentsController(service);
    res = mockRes();
    next = jest.fn();
  });

  describe("getAll", () => {
    it("pasa la query validada tal cual", async () => {
      service.getAll.mockResolvedValue({ data: [] });
      const query = { page: 1, limit: 10, branchId: 2, status: "PENDING" };

      await controller.getAll({ validatedQuery: query } as never, res, next);

      expect(service.getAll).toHaveBeenCalledWith(query);
    });

    it("aplica valores por defecto sin query validada", async () => {
      service.getAll.mockResolvedValue({ data: [] });

      await controller.getAll({} as never, res, next);

      expect(service.getAll).toHaveBeenCalledWith({
        page: 1,
        limit: 10,
        withDeleted: false,
        onlyGuests: false,
      });
    });

    it("delega errores", async () => {
      service.getAll.mockRejectedValue(new Error("boom"));

      await controller.getAll({} as never, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe("getStats", () => {
    it("sin sucursal cuenta globalmente", async () => {
      service.getStats.mockResolvedValue([]);

      await controller.getStats({ query: {} } as never, res, next);

      expect(service.getStats).toHaveBeenCalledWith(undefined);
      expect(res.json).toHaveBeenCalledWith({ data: [] });
    });

    it("acota a la sucursal indicada", async () => {
      service.getStats.mockResolvedValue([{ status: "PENDING", total: 1 }]);

      await controller.getStats({ query: { branchId: "3" } } as never, res, next);

      expect(service.getStats).toHaveBeenCalledWith(3);
    });

    it("400 si branchId no es un id válido", async () => {
      await controller.getStats({ query: { branchId: "abc" } } as never, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });
  });

  describe("getById", () => {
    it("devuelve la cita", async () => {
      service.getById.mockResolvedValue({ id: 1 });

      await controller.getById({ params: { id: "1" } } as never, res, next);

      expect(res.json).toHaveBeenCalledWith({ id: 1 });
    });

    it("404 si no existe", async () => {
      service.getById.mockResolvedValue(null);

      await controller.getById({ params: { id: "9" } } as never, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    });
  });

  it("create responde 201", async () => {
    service.create.mockResolvedValue({ id: 4 });

    await controller.create({ body: { branchId: 1 } } as never, res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ id: 4 });
  });

  it("create propaga el conflicto de horarios", async () => {
    service.create.mockRejectedValue(Object.assign(new Error("solape"), { statusCode: 409 }));

    await controller.create({ body: {} } as never, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 409 }));
  });

  describe("update", () => {
    it("devuelve la cita actualizada", async () => {
      service.update.mockResolvedValue({ id: 1 });

      await controller.update({ params: { id: "1" }, body: { details: "x" } } as never, res, next);

      expect(service.update).toHaveBeenCalledWith(1, { details: "x" });
    });

    it("404 si no existe", async () => {
      service.update.mockResolvedValue(null);

      await controller.update({ params: { id: "9" }, body: {} } as never, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    });
  });

  describe("borrados", () => {
    it.each([
      ["softDelete", "softDelete"],
      ["hardDelete", "hardDelete"],
    ] as const)("%s responde 204 y 404 según el resultado", async (method, spy) => {
      service[spy].mockResolvedValue(true);
      await controller[method]({ params: { id: "1" } } as never, res, next);
      expect(res.status).toHaveBeenCalledWith(204);

      service[spy].mockResolvedValue(false);
      await controller[method]({ params: { id: "1" } } as never, res, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    });

    it("restore confirma o devuelve 404", async () => {
      service.restore.mockResolvedValue(true);
      await controller.restore({ params: { id: "1" } } as never, res, next);
      expect(res.json).toHaveBeenCalledWith({ status: "ok", message: "Appointment restored" });

      service.restore.mockResolvedValue(false);
      await controller.restore({ params: { id: "1" } } as never, res, next);
      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    });
  });
});
