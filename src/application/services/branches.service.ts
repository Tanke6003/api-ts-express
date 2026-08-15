// src/application/services/branches.service.ts
import { inject, injectable } from "tsyringe";
import type { IBranchesService } from "../../domain/interfaces/application/services/branches.service.interface";
import type { IBranchesRepository } from "../../domain/interfaces/infrastructure/repositories/branches.repository.interface";
import type { IUnitOfWork } from "../../domain/interfaces/infrastructure/repositories/unit-of-work.interface";
import type { WhereFilter } from "../../domain/interfaces/infrastructure/repositories/generic.repository.interface";
import type { ILogger } from "../../domain/interfaces/infrastructure/plugins/logger.plugin.interface";
import { ENTITY_NAMES } from "../../domain/models/entity-names";
import { IBranch } from "../../domain/models/branches.model";
import type { IAppointmentsRepository } from "../../domain/interfaces/infrastructure/repositories/appointments.repository.interface";
import {
  BranchDTO,
  BranchQueryDTO,
  CreateBranchDTO,
  UpdateBranchDTO,
} from "../dtos/branches.dtos";
import { PaginatedDTO } from "../dtos/common.dtos";
import { AppError } from "../../core/errors/app-error";
import { branchMapper } from "../mapping/profiles";
import { TOKENS } from "../../core/di/tokens";
import type { ITransactionContext } from "../../domain/interfaces/infrastructure/plugins/transaction-context.plugin.interface";
import { Transactional, TransactionalService } from "../transactions/transactional";

@injectable()
export class BranchesService extends TransactionalService implements IBranchesService {
  constructor(
    @inject(TOKENS.IBranchesRepository) private readonly repository: IBranchesRepository,
    // Inyectado y no sacado del ámbito de la transacción: dentro de ella se
    // apunta solo, y así la dependencia se ve en la firma.
    @inject(TOKENS.IAppointmentsRepository)
    private readonly appointmentsRepository: IAppointmentsRepository,
    @inject(TOKENS.IUnitOfWork) unitOfWork: IUnitOfWork,
    @inject(TOKENS.ITransactionContext) transactions: ITransactionContext,
    @inject(TOKENS.ILogger) private readonly logger: ILogger
  ) {
    super(unitOfWork, transactions);
  }

  async getAll(query: BranchQueryDTO): Promise<PaginatedDTO<BranchDTO>> {
    const { page, limit, search, withDeleted } = query;

    // Consulta compuesta: el término busca a la vez en nombre y dirección, así
    // que las dos condiciones van en un OR dentro del AND general.
    const where: WhereFilter<IBranch> | undefined = search
      ? { $or: [{ name: { contains: search } }, { address: { contains: search } }] }
      : undefined;

    const paged = await this.repository.getPaged(page, limit, {
      where,
      withDeleted,
      orderBy: { field: "name", direction: "asc" },
    });

    return {
      data: paged.items.map((branch) => this.toDTO(branch)),
      total: paged.total,
      page: paged.page,
      limit: paged.limit,
      pages: paged.pages,
    };
  }

  async getById(id: number): Promise<BranchDTO | null> {
    const branch = await this.repository.getById(id);
    return branch ? this.toDTO(branch) : null;
  }

  async create(branch: CreateBranchDTO): Promise<BranchDTO> {
    this.assertSchedule(branch.opensAt, branch.closesAt);

    // Una sola sentencia: ya es atómica, no necesita transacción explícita.
    const created = await this.repository.insert(this.toModel(branch));
    this.logger.info("Sucursal creada", { id: created.pkBranch });
    return this.toDTO(created);
  }

  async update(id: number, branch: UpdateBranchDTO): Promise<BranchDTO | null> {
    const current = await this.repository.getById(id);
    if (!current) return null;

    this.assertSchedule(
      branch.opensAt ?? current.opensAt,
      branch.closesAt ?? current.closesAt
    );

    const updated = await this.repository.update(id, this.toModel(branch));
    return updated ? this.toDTO(updated) : null;
  }

  /**
   * Baja lógica de la sucursal y cancelación de sus citas futuras.
   *
   * Son dos escrituras en tablas distintas y una a medias dejaría citas vivas en
   * una sucursal cerrada, así que van en la misma transacción.
   */
  @Transactional()
  async softDelete(id: number): Promise<boolean> {
    // El mismo bloqueo que toma el alta de citas: sin él, una cita podría
    // colarse en la sucursal entre la baja y la cancelación de su agenda, y
    // quedaría viva en una sucursal cerrada. Primera sentencia, como allí.
    await this.lockRow(ENTITY_NAMES.BRANCHES, id);

    const deleted = await this.repository.softDelete(id);
    if (!deleted) return false;

    const cancelled = await this.appointmentsRepository.updateWhere(
      {
        $and: [
          { fkBranch: id },
          { scheduledAt: { gte: new Date() } },
          { status: { notIn: ["CANCELLED", "DONE"] } },
        ],
      },
      { status: "CANCELLED" }
    );

    this.logger.warn("Sucursal dada de baja", { id, citasCanceladas: cancelled });
    return true;
  }

  async restore(id: number): Promise<boolean> {
    // Las citas canceladas no se "descancelan" solas: reactivar una sucursal no
    // puede adivinar cuáles seguían en pie, así que se restaura sólo la
    // sucursal y se reagenda a mano.
    return this.repository.restore(id);
  }

  /**
   * Baja física. Las citas referencian la sucursal por clave foránea, así que
   * hay que borrarlas primero o la base rechaza el DELETE. Ambas cosas en la
   * misma transacción para no quedarse a medio camino.
   */
  @Transactional()
  async hardDelete(id: number): Promise<boolean> {
    // Mismo bloqueo que el alta de citas, por el mismo motivo: que no entre una
    // cita nueva entre el borrado de la agenda y el de la sucursal.
    await this.lockRow(ENTITY_NAMES.BRANCHES, id);

    const removedAppointments = await this.appointmentsRepository.hardDeleteWhere({
      fkBranch: id,
    });
    const deleted = await this.repository.hardDelete(id);

    if (!deleted) {
      // Provoca el rollback: si la sucursal no existía, tampoco deberían
      // haberse borrado citas.
      throw new AppError("Branch not found", 404);
    }

    this.logger.warn("Sucursal eliminada definitivamente", {
      id,
      citasEliminadas: removedAppointments,
    });
    return true;
  }

  /** El horario de cierre debe ser posterior al de apertura. */
  private assertSchedule(opensAt?: string, closesAt?: string): void {
    if (!opensAt || !closesAt) return;
    if (opensAt >= closesAt) {
      throw new AppError("El horario de cierre debe ser posterior al de apertura", 400);
    }
  }

  private toDTO(branch: IBranch): BranchDTO {
    return branchMapper.toDTO(branch);
  }

  /** Sólo las claves presentes: un PUT parcial no debe borrar lo que no envía. */
  private toModel(branch: UpdateBranchDTO): Partial<IBranch> {
    return branchMapper.toPartialEntity(branch);
  }
}
