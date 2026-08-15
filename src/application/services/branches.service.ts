// src/application/services/branches.service.ts
import { inject, injectable } from "tsyringe";
import type { IBranchesService } from "../../domain/interfaces/application/services/branches.service.interface";
import type { IBranchesRepository } from "../../domain/interfaces/infrastructure/repositories/branches.repository.interface";
import type { IAppointmentsRepository } from "../../domain/interfaces/infrastructure/repositories/appointments.repository.interface";
import type { IUnitOfWork } from "../../domain/interfaces/infrastructure/repositories/unit-of-work.interface";
import type { ITransactionContext } from "../../domain/interfaces/infrastructure/plugins/transaction-context.plugin.interface";
import type { QueryOptions } from "../../domain/interfaces/infrastructure/repositories/generic.repository.interface";
import type { ILogger } from "../../domain/interfaces/infrastructure/plugins/logger.plugin.interface";
import { ENTITY_NAMES } from "../../domain/models/entity-names";
import type { IBranch } from "../../domain/models/branches.model";
import type { BranchDTO, BranchQueryDTO, UpdateBranchDTO } from "../dtos/branches.dtos";
import { AppError } from "../../core/errors/app-error";
import { branchMapper } from "../mapping/profiles";
import { CrudService } from "./crud.service";
import { lockRow, Transactional } from "../transactions/transactional";
import { TOKENS } from "../../core/di/tokens";

/**
 * Sucursales.
 *
 * Ejemplo del punto medio: el listado, la consulta por id, el alta y la
 * edición son el CRUD de siempre y vienen de `CrudService`; lo que este módulo
 * escribe es sólo lo que tiene regla —el horario, y las dos bajas, que arrastran
 * la agenda—.
 *
 * Hereda de `CrudService` y no de `TransactionalService` porque de las dos sólo
 * se puede heredar una; la transacción entra por composición, que es lo que el
 * decorador necesita: la unidad de trabajo y el contexto expuestos en la clase.
 */
@injectable()
export class BranchesService extends CrudService<IBranch, BranchDTO> implements IBranchesService {
  constructor(
    @inject(TOKENS.IBranchesRepository) repository: IBranchesRepository,
    @inject(TOKENS.IAppointmentsRepository)
    private readonly appointmentsRepository: IAppointmentsRepository,
    @inject(TOKENS.IUnitOfWork) readonly unitOfWork: IUnitOfWork,
    @inject(TOKENS.ITransactionContext) readonly transactions: ITransactionContext,
    @inject(TOKENS.ILogger) private readonly logger: ILogger
  ) {
    super(repository, branchMapper, { field: "name", direction: "asc" });
  }

  /** El término busca a la vez en el nombre y en la dirección. */
  protected override buildWhere(query?: BranchQueryDTO): QueryOptions<IBranch>["where"] {
    if (!query?.search) return undefined;

    return { $or: [{ name: { contains: query.search } }, { address: { contains: query.search } }] };
  }

  override async create(branch: Partial<BranchDTO>): Promise<BranchDTO> {
    this.assertSchedule(branch.opensAt, branch.closesAt);

    const created = await super.create(branch);
    this.logger.info("Sucursal creada", { id: created.id });
    return created;
  }

  override async update(id: number, branch: UpdateBranchDTO): Promise<BranchDTO | null> {
    const current = await this.repository.getById(id);
    if (!current) return null;

    // Se valida sobre el resultado combinado: si sólo llega el cierre, se
    // contrasta contra la apertura que ya estaba guardada.
    this.assertSchedule(branch.opensAt ?? current.opensAt, branch.closesAt ?? current.closesAt);

    return super.update(id, branch);
  }

  /**
   * Baja lógica de la sucursal y cancelación de sus citas futuras.
   *
   * Son dos escrituras en tablas distintas y una a medias dejaría citas vivas en
   * una sucursal cerrada, así que van en la misma transacción.
   */
  @Transactional()
  override async softDelete(id: number): Promise<boolean> {
    // El mismo bloqueo que toma el alta de citas: sin él, una cita podría
    // colarse en la sucursal entre la baja y la cancelación de su agenda.
    // Primera sentencia, como allí.
    await lockRow(this.transactions, ENTITY_NAMES.BRANCHES, id);

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

  restore(id: number): Promise<boolean> {
    // Las citas canceladas no se "descancelan" solas: reactivar una sucursal no
    // puede adivinar cuáles seguían en pie, así que se restaura sólo la
    // sucursal y se reagenda a mano.
    return this.repository.restore(id);
  }

  /**
   * Baja física. Las citas referencian la sucursal por clave foránea, así que
   * hay que borrarlas primero o la base rechaza el DELETE.
   */
  @Transactional()
  async hardDelete(id: number): Promise<boolean> {
    await lockRow(this.transactions, ENTITY_NAMES.BRANCHES, id);

    const removedAppointments = await this.appointmentsRepository.hardDeleteWhere({ fkBranch: id });
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
}
