// src/infrastructure/repositories/appointments.repository.ts
import { inject, injectable } from "tsyringe";
import type {
  AppointmentStatusCount,
  IAppointmentsRepository,
} from "../../domain/interfaces/infrastructure/repositories/appointments.repository.interface";
import type { IGenericRepository } from "../../domain/interfaces/infrastructure/repositories/generic.repository.interface";
import type { ILogger } from "../../domain/interfaces/infrastructure/plugins/logger.plugin.interface";
import type { AppointmentStatus, IAppointment } from "../../domain/models/appointments.model";
import { BaseModuleRepository } from "./base/module.repository";
import { OracleGenericRepository } from "./base/oracle.generic.repository";
import { APPOINTMENTS_ENTITY } from "./entities";

/**
 * Citas. El CRUD y las consultas por filtro los hereda del repositorio
 * genérico; lo único propio es `countByStatus`, que necesita un `GROUP BY`.
 *
 * Ese método tiene dos caminos porque la agregación sí depende del driver:
 * contra Oracle baja a SQL por la vía de escape del repositorio genérico, y en
 * modo memoria se calcula sobre lo que ese mismo repositorio devuelve. Así el
 * módulo funciona igual en los dos modos sin obligar a levantar Docker para
 * desarrollar.
 */
@injectable()
export class AppointmentsRepository
  extends BaseModuleRepository<IAppointment>
  implements IAppointmentsRepository
{
  constructor(
    @inject("AppointmentsStore") store: IGenericRepository<IAppointment>,
    @inject("ILogger") logger: ILogger
  ) {
    super(store, logger, "AppointmentsRepository");
  }

  async countByStatus(fkBranch?: number): Promise<AppointmentStatusCount[]> {
    return this.guard(
      "countByStatus",
      async () =>
        this.store instanceof OracleGenericRepository
          ? this.countByStatusSql(this.store, fkBranch)
          : this.countByStatusInMemory(fkBranch),
      { fkBranch }
    );
  }

  private async countByStatusSql(
    store: OracleGenericRepository<IAppointment>,
    fkBranch?: number
  ): Promise<AppointmentStatusCount[]> {
    // Los nombres físicos salen del mapeo, no se escriben a mano aquí.
    const statusColumn = store.schema.columnOf("status");
    const availableColumn = store.schema.columnOf("available");
    const branchColumn = store.schema.columnOf("fkBranch");

    const binds: Record<string, unknown> = { active: 1 };
    let sql =
      `SELECT ${statusColumn} AS STATUS, COUNT(*) AS TOTAL ` +
      `FROM ${APPOINTMENTS_ENTITY.table} WHERE ${availableColumn} = :active`;

    if (fkBranch !== undefined) {
      sql += ` AND ${branchColumn} = :branch`;
      binds.branch = fkBranch;
    }

    sql += ` GROUP BY ${statusColumn} ORDER BY ${statusColumn}`;

    const rows = await store.executeRaw<{ STATUS: string; TOTAL: number }>(sql, binds);
    return rows.map((row) => ({
      status: row.STATUS as AppointmentStatus,
      total: Number(row.TOTAL),
    }));
  }

  private async countByStatusInMemory(fkBranch?: number): Promise<AppointmentStatusCount[]> {
    const appointments = await this.store.getAll(
      fkBranch === undefined ? {} : { where: { fkBranch } }
    );

    const totals = new Map<AppointmentStatus, number>();
    for (const appointment of appointments) {
      totals.set(appointment.status, (totals.get(appointment.status) ?? 0) + 1);
    }

    return [...totals.entries()]
      .map(([status, total]) => ({ status, total }))
      .sort((a, b) => a.status.localeCompare(b.status));
  }
}
