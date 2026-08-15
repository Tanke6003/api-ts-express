import { AppointmentsService } from "../../../src/application/services/appointments.service";
import { ENTITY_NAMES } from "../../../src/domain/models/entity-names";
import { IAppointment } from "../../../src/domain/models/appointments.model";
import { IBranch } from "../../../src/domain/models/branches.model";
import { IUser } from "../../../src/domain/models/users.model";

const HOUR = 60 * 60 * 1000;
const future = (hours = 24) => new Date(Date.now() + hours * HOUR);

const appointment = (over: Partial<IAppointment> = {}): IAppointment => ({
  pkAppointment: 1,
  fkBranch: 1,
  fkClient: null,
  guestName: "Invitado",
  scheduledAt: future(),
  durationMin: 30,
  status: "PENDING",
  details: null,
  available: true,
  ...over,
});

const branch: IBranch = { pkBranch: 1, name: "Sucursal Centro", available: true };
const client: IUser = { pkUser: 3, name: "Alice", isClient: true, available: true };

describe("AppointmentsService", () => {
  let repository: any;
  let branchesRepository: any;
  let usersRepository: any;
  let scope: any;
  let transactions: any;
  let unitOfWork: any;
  let service: AppointmentsService;

  beforeEach(() => {
    repository = {
      getPaged: jest.fn(),
      getById: jest.fn(),
      find: jest.fn().mockResolvedValue([]),
      insert: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      restore: jest.fn(),
      hardDelete: jest.fn(),
      countByStatus: jest.fn(),
    };

    branchesRepository = { getById: jest.fn().mockResolvedValue(branch), find: jest.fn().mockResolvedValue([branch]) };
    usersRepository = {
      getById: jest.fn().mockResolvedValue(client),
      find: jest.fn().mockResolvedValue([client]),
    };

    // El ámbito de la transacción devuelve los mismos dobles que fuera de ella:
    // aquí se prueban las reglas del servicio, y que la unidad de trabajo enlace
    // de verdad los repositorios es cosa de sus propios tests.
    scope = {
      repository: (entity: string) => {
        if (entity === ENTITY_NAMES.BRANCHES) return branchesRepository;
        if (entity === ENTITY_NAMES.USERS) return usersRepository;
        return repository;
      },
      lockRow: jest.fn().mockResolvedValue(true),
    };
    // La transacción se publica en el contexto mientras corre el bloque, que es
    // lo que hace que `this.lockRow(...)` del servicio la encuentre.
    let active: unknown;
    transactions = { current: () => active, run: (s: unknown, fn: any) => fn() };
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

    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    service = new AppointmentsService(
      repository,
      branchesRepository,
      usersRepository,
      unitOfWork,
      transactions,
      logger as never
    );
  });

  // ==========================================  consultas compuestas  =======
  describe("getAll", () => {
    beforeEach(() => {
      repository.getPaged.mockResolvedValue({
        items: [],
        total: 0,
        page: 1,
        limit: 10,
        pages: 0,
      });
    });

    it("sin filtros no manda where", async () => {
      await service.getAll({ page: 1, limit: 10 });

      expect(repository.getPaged).toHaveBeenCalledWith(1, 10, {
        where: undefined,
        withDeleted: undefined,
        orderBy: { field: "scheduledAt", direction: "asc" },
      });
    });

    it("combina todos los filtros con AND", async () => {
      await service.getAll({
        page: 1,
        limit: 10,
        branchId: 2,
        clientId: 3,
        status: "PENDING",
        from: "2026-01-01T00:00:00Z",
        to: "2026-12-31T23:59:59Z",
        onlyGuests: true,
        search: "revisión",
      });

      const { where } = repository.getPaged.mock.calls[0][2];
      expect(where.$and).toEqual([
        { fkBranch: 2 },
        { fkClient: 3 },
        { status: "PENDING" },
        { scheduledAt: { gte: new Date("2026-01-01T00:00:00Z") } },
        { scheduledAt: { lte: new Date("2026-12-31T23:59:59Z") } },
        { fkClient: { isNull: true } },
        {
          $or: [{ details: { contains: "revisión" } }, { guestName: { contains: "revisión" } }],
        },
      ]);
    });
  });

  // ==================================================  Include (batched)  ==
  describe("resolución de relaciones", () => {
    it("resuelve sucursal y cliente en una consulta por relación, no una por fila", async () => {
      repository.getPaged.mockResolvedValue({
        items: [
          appointment({ pkAppointment: 1, fkBranch: 1, fkClient: 3, guestName: null }),
          appointment({ pkAppointment: 2, fkBranch: 1, fkClient: 3, guestName: null }),
          appointment({ pkAppointment: 3, fkBranch: 1, fkClient: null, guestName: "Walk-in" }),
        ],
        total: 3,
        page: 1,
        limit: 10,
        pages: 1,
      });

      const result = await service.getAll({ page: 1, limit: 10 });

      // Una sola consulta de sucursales para las tres citas...
      expect(branchesRepository.find).toHaveBeenCalledTimes(1);
      expect(branchesRepository.find).toHaveBeenCalledWith({
        where: { pkBranch: { in: [1] } },
        withDeleted: true,
      });
      // ...y una sola lectura por cliente distinto, no por cita.
      expect(usersRepository.find).toHaveBeenCalledTimes(1);

      expect(result.data[0]).toMatchObject({
        branchName: "Sucursal Centro",
        clientId: 3,
        clientName: "Alice",
        displayName: "Alice",
      });
      // Sin cliente registrado se muestra el nombre del invitado.
      expect(result.data[2]).toMatchObject({
        clientId: null,
        clientName: null,
        guestName: "Walk-in",
        displayName: "Walk-in",
      });
    });

    it("no consulta relaciones si no hay citas", async () => {
      repository.getPaged.mockResolvedValue({ items: [], total: 0, page: 1, limit: 10, pages: 0 });

      await service.getAll({ page: 1, limit: 10 });

      expect(branchesRepository.find).not.toHaveBeenCalled();
      expect(usersRepository.find).not.toHaveBeenCalled();
    });

    it("tolera una relación que ya no se puede resolver", async () => {
      branchesRepository.find.mockResolvedValue([]);
      usersRepository.find.mockResolvedValue([]);
      repository.getById.mockResolvedValue(appointment({ fkClient: 3, guestName: null }));

      const dto = await service.getById(1);

      expect(dto).toMatchObject({ branchName: null, clientName: null, displayName: "Sin nombre" });
    });

    it("getById devuelve null si no existe", async () => {
      repository.getById.mockResolvedValue(null);
      expect(await service.getById(99)).toBeNull();
    });
  });

  // =====================================================  alta de citas  ===
  describe("create", () => {
    const base = { branchId: 1, guestName: "Invitado", scheduledAt: future().toISOString() };

    beforeEach(() => {
      repository.insert.mockImplementation(async (entity: Partial<IAppointment>) =>
        appointment(entity)
      );
    });

    it("comprueba y escribe dentro de una transacción, bloqueando antes la sucursal", async () => {
      await service.create(base);

      expect(unitOfWork.execute).toHaveBeenCalledTimes(1);
      expect(scope.lockRow).toHaveBeenCalledWith(ENTITY_NAMES.BRANCHES, 1);

      // El bloqueo tiene que ser la primera sentencia de la transacción: si se
      // consulta antes, en MySQL la instantánea queda fijada y las lecturas
      // posteriores no verían lo que otra transacción acaba de confirmar.
      const lock = scope.lockRow.mock.invocationCallOrder[0];
      expect(lock).toBeLessThan(branchesRepository.getById.mock.invocationCallOrder[0]);
      expect(lock).toBeLessThan(repository.find.mock.invocationCallOrder[0]);
      expect(lock).toBeLessThan(repository.insert.mock.invocationCallOrder[0]);
    });

    it("traduce la violación del índice único al conflicto de solape", async () => {
      // Lo que llega cuando dos instancias ganan la comprobación a la vez y es
      // la base la que corta: PostgreSQL 23505, con la forma que espera
      // `error-mapper`.
      repository.insert.mockRejectedValue(Object.assign(new Error("duplicate key"), { code: "23505" }));

      await expect(service.create(base)).rejects.toMatchObject({
        statusCode: 409,
        code: "APPOINTMENT_OVERLAP",
      });
    });

    it("agenda una cita de invitado con los valores por defecto", async () => {
      const created = await service.create(base);

      expect(repository.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          fkBranch: 1,
          fkClient: null,
          guestName: "Invitado",
          durationMin: 30,
          status: "PENDING",
          details: null,
        })
      );
      expect(created.displayName).toBe("Invitado");
    });

    it("con cliente registrado no duplica el nombre en guestName", async () => {
      await service.create({ ...base, clientId: 3, guestName: "Se ignora" });

      expect(repository.insert).toHaveBeenCalledWith(
        expect.objectContaining({ fkClient: 3, guestName: null })
      );
    });

    it("rechaza fechas pasadas", async () => {
      await expect(
        service.create({ ...base, scheduledAt: "2020-01-01T10:00:00Z" })
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rechaza una sucursal inexistente o dada de baja", async () => {
      branchesRepository.getById.mockResolvedValue(null);

      await expect(service.create(base)).rejects.toMatchObject({ statusCode: 400 });
    });

    it("rechaza un cliente inexistente", async () => {
      usersRepository.getById.mockResolvedValue(null);

      await expect(service.create({ ...base, clientId: 99 })).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it("rechaza un usuario que no está dado de alta como cliente", async () => {
      usersRepository.getById.mockResolvedValue({ ...client, isClient: false });

      await expect(service.create({ ...base, clientId: 4 })).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it("exige cliente o nombre de invitado", async () => {
      await expect(
        service.create({ branchId: 1, scheduledAt: base.scheduledAt, guestName: "   " })
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  // ==========================================  detección de solapes  =======
  describe("solapes", () => {
    const start = future(48);

    it("acota la búsqueda a la sucursal y descarta las canceladas", async () => {
      repository.insert.mockResolvedValue(appointment());

      await service.create({
        branchId: 1,
        guestName: "X",
        scheduledAt: start.toISOString(),
        durationMin: 60,
      });

      const { where } = repository.find.mock.calls[0][0];
      expect(where.$and[0]).toEqual({ fkBranch: 1 });
      expect(where.$and[1].scheduledAt.gte).toBeInstanceOf(Date);
      expect(where.$and[1].scheduledAt.lt).toEqual(new Date(start.getTime() + 60 * 60 * 1000));
      expect(where.$and[2]).toEqual({ status: { notIn: ["CANCELLED"] } });
    });

    it("rechaza con 409 una cita que pisa a otra", async () => {
      // La existente empieza 30 min antes y dura 60: llega hasta pasada la nueva.
      repository.find.mockResolvedValue([
        appointment({
          pkAppointment: 8,
          scheduledAt: new Date(start.getTime() - 30 * 60 * 1000),
          durationMin: 60,
        }),
      ]);

      await expect(
        service.create({ branchId: 1, guestName: "X", scheduledAt: start.toISOString() })
      ).rejects.toMatchObject({ statusCode: 409 });
    });

    it("acepta una cita que empieza justo cuando acaba la anterior", async () => {
      repository.find.mockResolvedValue([
        appointment({
          pkAppointment: 8,
          scheduledAt: new Date(start.getTime() - 30 * 60 * 1000),
          durationMin: 30,
        }),
      ]);
      repository.insert.mockResolvedValue(appointment());

      await expect(
        service.create({ branchId: 1, guestName: "X", scheduledAt: start.toISOString() })
      ).resolves.toBeDefined();
    });
  });

  // ==================================================  actualización  ======
  describe("update", () => {
    beforeEach(() => {
      repository.getById.mockResolvedValue(
        appointment({ fkClient: 3, guestName: null, details: "original" })
      );
      repository.update.mockImplementation(async (_id: number, changes: Partial<IAppointment>) =>
        appointment(changes)
      );
    });

    it("devuelve null si la cita no existe", async () => {
      repository.getById.mockResolvedValue(null);
      expect(await service.update(99, { details: "x" })).toBeNull();
    });

    it("mantiene los valores no enviados", async () => {
      await service.update(1, { details: "actualizado" });

      expect(repository.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ fkBranch: 1, fkClient: 3, details: "actualizado" })
      );
    });

    it("un cambio que no mueve la cita no vuelve a comprobar solapes", async () => {
      await service.update(1, { details: "sólo texto" });
      expect(repository.find).not.toHaveBeenCalled();
    });

    it("reagendar sí comprueba solapes, excluyendo la propia cita", async () => {
      await service.update(1, { scheduledAt: future(72).toISOString() });

      const { where } = repository.find.mock.calls[0][0];
      expect(where.$and).toContainEqual({ pkAppointment: { ne: 1 } });
    });

    it("cancelar no comprueba solapes", async () => {
      await service.update(1, { status: "CANCELLED", scheduledAt: future(72).toISOString() });
      expect(repository.find).not.toHaveBeenCalled();
    });

    it("pasar de cliente a invitado exige un nombre", async () => {
      await expect(service.update(1, { clientId: null })).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it("pasar de cliente a invitado con nombre limpia la FK", async () => {
      await service.update(1, { clientId: null, guestName: "Invitado" });

      expect(repository.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ fkClient: null, guestName: "Invitado" })
      );
    });

    it("asignar un cliente borra el nombre de invitado", async () => {
      repository.getById.mockResolvedValue(appointment({ fkClient: null, guestName: "Walk-in" }));

      await service.update(1, { clientId: 3 });

      expect(repository.update).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ fkClient: 3, guestName: null })
      );
    });

    it("valida la nueva sucursal", async () => {
      branchesRepository.getById.mockResolvedValue(null);

      await expect(service.update(1, { branchId: 9 })).rejects.toMatchObject({ statusCode: 400 });
    });

    it("devuelve null si el update no encuentra la fila", async () => {
      repository.update.mockResolvedValue(null);
      expect(await service.update(1, { details: "x" })).toBeNull();
    });
  });

  // =========================================================  borrados  ====
  it("delega los borrados y el conteo por estado en el repositorio", async () => {
    repository.softDelete.mockResolvedValue(true);
    repository.restore.mockResolvedValue(true);
    repository.hardDelete.mockResolvedValue(true);
    repository.countByStatus.mockResolvedValue([{ status: "PENDING", total: 2 }]);

    expect(await service.softDelete(1)).toBe(true);
    expect(await service.restore(1)).toBe(true);
    expect(await service.hardDelete(1)).toBe(true);
    expect(await service.getStats(1)).toEqual([{ status: "PENDING", total: 2 }]);
    expect(repository.countByStatus).toHaveBeenCalledWith(1);
  });
});
