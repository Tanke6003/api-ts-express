import { AppointmentsRepository } from "../../../src/infrastructure/repositories/appointments.repository";
import { BranchesRepository } from "../../../src/infrastructure/repositories/branches.repository";
import { MemoryGenericRepository } from "../../../src/infrastructure/repositories/base/drivers/memory.generic.repository";
import { OracleGenericRepository } from "../../../src/infrastructure/repositories/base/drivers/oracle.generic.repository";
import { APPOINTMENTS_ENTITY, BRANCHES_ENTITY } from "../../../src/infrastructure/repositories/entities";
import { APPOINTMENTS_SEED, BRANCHES_SEED } from "../../../src/infrastructure/repositories/seed-data";
import { IAppointment } from "../../../src/domain/models/appointments.model";
import { IBranch } from "../../../src/domain/models/branches.model";
import {
  FakeSqlExecutor,
  silentLogger,
} from "../infrastructure/repositories/base/fake-sql-executor";

describe("AppointmentsRepository", () => {
  const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as never;

  describe("countByStatus en memoria", () => {
    let repository: AppointmentsRepository;

    beforeEach(() => {
      const store = new MemoryGenericRepository<IAppointment>(
        APPOINTMENTS_ENTITY,
        APPOINTMENTS_SEED
      );
      repository = new AppointmentsRepository(store, logger);
    });

    it("agrupa por estado y ordena alfabéticamente", async () => {
      // El seed trae una CONFIRMED y tres PENDING.
      expect(await repository.countByStatus()).toEqual([
        { status: "CONFIRMED", total: 1 },
        { status: "PENDING", total: 3 },
      ]);
    });

    it("acota el conteo a una sucursal", async () => {
      expect(await repository.countByStatus(3)).toEqual([{ status: "PENDING", total: 1 }]);
      expect(await repository.countByStatus(999)).toEqual([]);
    });
  });

  describe("countByStatus sobre Oracle", () => {
    let db: FakeSqlExecutor;
    let repository: AppointmentsRepository;

    beforeEach(() => {
      db = new FakeSqlExecutor();
      const store = new OracleGenericRepository<IAppointment>(
        db,
        APPOINTMENTS_ENTITY,
        silentLogger
      );
      repository = new AppointmentsRepository(store, logger);
    });

    it("baja a un GROUP BY, que el repositorio genérico no expresa", async () => {
      db.queue({
        rows: [
          { STATUS: "PENDING", TOTAL: 3 },
          { STATUS: "DONE", TOTAL: 1 },
        ],
      });

      const totals = await repository.countByStatus();

      expect(db.lastSql).toBe(
        "SELECT STATUS AS STATUS, COUNT(*) AS TOTAL FROM APPOINTMENTS " +
          "WHERE AVAILABLE = :active GROUP BY STATUS ORDER BY STATUS"
      );
      expect(db.lastBinds).toEqual({ active: 1 });
      expect(totals).toEqual([
        { status: "PENDING", total: 3 },
        { status: "DONE", total: 1 },
      ]);
    });

    it("añade el filtro de sucursal como bind", async () => {
      db.queue({ rows: [] });
      await repository.countByStatus(2);

      expect(db.lastSql).toContain("AND FK_BRANCH = :branch");
      expect(db.lastBinds).toEqual({ active: 1, branch: 2 });
    });

    it("traduce el fallo del driver a un error del repositorio", async () => {
      jest.spyOn(db, "execute").mockRejectedValue(new Error("ORA-00942"));

      await expect(repository.countByStatus()).rejects.toThrow(
        "AppointmentsRepository.countByStatus failed."
      );
    });
  });

  it("hereda el CRUD del repositorio genérico sin reimplementarlo", async () => {
    const store = new MemoryGenericRepository<IAppointment>(APPOINTMENTS_ENTITY, APPOINTMENTS_SEED);
    const repository = new AppointmentsRepository(store, logger);

    expect(await repository.count()).toBe(4);
    expect(await repository.softDelete(1)).toBe(true);
    expect(await repository.count()).toBe(3);
  });
});

describe("BranchesRepository", () => {
  it("es el repositorio genérico con el contexto del módulo", async () => {
    const store = new MemoryGenericRepository<IBranch>(BRANCHES_ENTITY, BRANCHES_SEED);
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } as never;
    const repository = new BranchesRepository(store, logger);

    expect(await repository.count()).toBe(3);
    expect(await repository.getById(1)).toMatchObject({ name: "Sucursal Centro" });

    jest.spyOn(store, "getById").mockRejectedValue(new Error("boom"));
    await expect(repository.getById(1)).rejects.toThrow("BranchesRepository.getById failed.");
  });
});
