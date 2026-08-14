import { BranchesController } from "../../../src/presentation/controllers/branches.controller";

const mockRes = () => {
  const res: any = {};
  res.json = jest.fn().mockReturnValue(res);
  res.status = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res;
};

describe("BranchesController", () => {
  let service: any;
  let controller: BranchesController;
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
    };
    controller = new BranchesController(service);
    res = mockRes();
    next = jest.fn();
  });

  describe("getAll", () => {
    it("pasa la query ya validada al servicio", async () => {
      const page = { data: [], total: 0, page: 2, limit: 5, pages: 0 };
      service.getAll.mockResolvedValue(page);

      await controller.getAll(
        { validatedQuery: { page: 2, limit: 5, search: "a", withDeleted: true } } as never,
        res,
        next
      );

      expect(service.getAll).toHaveBeenCalledWith({
        page: 2,
        limit: 5,
        search: "a",
        withDeleted: true,
      });
      expect(res.json).toHaveBeenCalledWith(page);
    });

    it("usa valores por defecto si el middleware no dejó query validada", async () => {
      service.getAll.mockResolvedValue({ data: [] });

      await controller.getAll({} as never, res, next);

      expect(service.getAll).toHaveBeenCalledWith({ page: 1, limit: 10, withDeleted: false });
    });

    it("delega el error en next", async () => {
      service.getAll.mockRejectedValue(new Error("boom"));

      await controller.getAll({ validatedQuery: { page: 1, limit: 10 } } as never, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
      expect(res.json).not.toHaveBeenCalled();
    });
  });

  describe("getById", () => {
    it("devuelve la sucursal", async () => {
      service.getById.mockResolvedValue({ id: 1 });

      await controller.getById({ params: { id: "1" } } as never, res, next);

      expect(res.json).toHaveBeenCalledWith({ id: 1 });
    });

    it("404 si no existe", async () => {
      service.getById.mockResolvedValue(null);

      await controller.getById({ params: { id: "9" } } as never, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    });

    it("400 si el id no es válido", async () => {
      await controller.getById({ params: { id: "abc" } } as never, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
      expect(service.getById).not.toHaveBeenCalled();
    });
  });

  it("create responde 201 con el recurso creado", async () => {
    service.create.mockResolvedValue({ id: 5 });

    await controller.create({ body: { name: "Nueva" } } as never, res, next);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({ id: 5 });
  });

  it("create delega los errores del servicio", async () => {
    service.create.mockRejectedValue(new Error("boom"));

    await controller.create({ body: {} } as never, res, next);

    expect(next).toHaveBeenCalled();
  });

  describe("update", () => {
    it("devuelve la sucursal actualizada", async () => {
      service.update.mockResolvedValue({ id: 1 });

      await controller.update({ params: { id: "1" }, body: { name: "X" } } as never, res, next);

      expect(service.update).toHaveBeenCalledWith(1, { name: "X" });
      expect(res.json).toHaveBeenCalledWith({ id: 1 });
    });

    it("404 si no existe", async () => {
      service.update.mockResolvedValue(null);

      await controller.update({ params: { id: "9" }, body: {} } as never, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    });
  });

  describe("borrados", () => {
    it("softDelete responde 204", async () => {
      service.softDelete.mockResolvedValue(true);

      await controller.softDelete({ params: { id: "1" } } as never, res, next);

      expect(res.status).toHaveBeenCalledWith(204);
    });

    it("softDelete 404 si no existe", async () => {
      service.softDelete.mockResolvedValue(false);

      await controller.softDelete({ params: { id: "9" } } as never, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    });

    it("hardDelete responde 204", async () => {
      service.hardDelete.mockResolvedValue(true);

      await controller.hardDelete({ params: { id: "1" } } as never, res, next);

      expect(res.status).toHaveBeenCalledWith(204);
    });

    it("hardDelete propaga el 404 que lanza el servicio", async () => {
      service.hardDelete.mockRejectedValue(Object.assign(new Error("nope"), { statusCode: 404 }));

      await controller.hardDelete({ params: { id: "9" } } as never, res, next);

      expect(next).toHaveBeenCalled();
    });

    it("restore confirma la restauración", async () => {
      service.restore.mockResolvedValue(true);

      await controller.restore({ params: { id: "1" } } as never, res, next);

      expect(res.json).toHaveBeenCalledWith({ status: "ok", message: "Branch restored" });
    });

    it("restore 404 si ya estaba activa", async () => {
      service.restore.mockResolvedValue(false);

      await controller.restore({ params: { id: "1" } } as never, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    });
  });
});
