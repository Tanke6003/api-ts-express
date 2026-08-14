// src/application/services/appointments.service.ts
import { inject, injectable } from "tsyringe";
import type { IAppointmentsService } from "../../domain/interfaces/application/services/appointments.service.interface";
import type {
  AppointmentStatusCount,
  IAppointmentsRepository,
} from "../../domain/interfaces/infrastructure/repositories/appointments.repository.interface";
import type { IBranchesRepository } from "../../domain/interfaces/infrastructure/repositories/branches.repository.interface";
import type { IUsersRepository } from "../../domain/interfaces/infrastructure/repositories/users.repository.interface";
import type {
  IGenericRepository,
  WhereFilter,
} from "../../domain/interfaces/infrastructure/repositories/generic.repository.interface";
import type {
  ITransactionScope,
  IUnitOfWork,
} from "../../domain/interfaces/infrastructure/repositories/unit-of-work.interface";
import type { ILogger } from "../../domain/interfaces/infrastructure/plugins/logger.plugin.interface";
import { ENTITY_NAMES } from "../../domain/models/entity-names";
import { IAppointment } from "../../domain/models/appointments.model";
import { IBranch } from "../../domain/models/branches.model";
import { IUser } from "../../domain/models/users.model";
import {
  AppointmentDTO,
  AppointmentQueryDTO,
  CreateAppointmentDTO,
  UpdateAppointmentDTO,
} from "../dtos/appointments.dtos";
import { PaginatedDTO } from "../dtos/common.dtos";
import { loadRelated } from "../queries/include.query";
import { appointmentMapper } from "../mapping/profiles";
import { AppError } from "../../core/errors/app-error";
import { normalizeError } from "../../core/errors/error-mapper";
import { TOKENS } from "../../core/di/tokens";

const DEFAULT_DURATION_MIN = 30;
/** Tope de `CK_APPT_DURATION`; acota la ventana de búsqueda de solapes. */
const MAX_DURATION_MIN = 1440;
const MINUTE_MS = 60_000;

/**
 * Reglas de negocio de las citas.
 *
 * Aquí es donde se componen las consultas: los repositorios sólo conocen su
 * propia tabla, y es este servicio el que combina filtros y resuelve las
 * relaciones (el equivalente a los `Include` de EF, ver `loadRelated`).
 */
@injectable()
export class AppointmentsService implements IAppointmentsService {
  constructor(
    @inject(TOKENS.IAppointmentsRepository) private readonly repository: IAppointmentsRepository,
    @inject(TOKENS.IBranchesRepository) private readonly branchesRepository: IBranchesRepository,
    @inject(TOKENS.IUsersRepository) private readonly usersRepository: IUsersRepository,
    @inject(TOKENS.IUnitOfWork) private readonly unitOfWork: IUnitOfWork,
    @inject(TOKENS.ILogger) private readonly logger: ILogger
  ) {}

  /**
   * Repositorios de la transacción, con los nombres que usa el resto del
   * servicio. Todo lo que se lea o escriba con ellos entra en el mismo commit y
   * ve lo que la propia transacción ya hizo.
   */
  private scopedRepositories(scope: ITransactionScope) {
    return {
      appointments: scope.repository<IAppointment>(ENTITY_NAMES.APPOINTMENTS),
      branches: scope.repository<IBranch>(ENTITY_NAMES.BRANCHES),
      users: scope.repository<IUser>(ENTITY_NAMES.USERS),
    };
  }

  // --------------------------------------------------------------- lectura --

  async getAll(query: AppointmentQueryDTO): Promise<PaginatedDTO<AppointmentDTO>> {
    const paged = await this.repository.getPaged(query.page, query.limit, {
      where: this.buildFilter(query),
      withDeleted: query.withDeleted,
      orderBy: { field: "scheduledAt", direction: "asc" },
    });

    return {
      data: await this.toDTOs(paged.items),
      total: paged.total,
      page: paged.page,
      limit: paged.limit,
      pages: paged.pages,
    };
  }

  async getById(id: number): Promise<AppointmentDTO | null> {
    const appointment = await this.repository.getById(id);
    if (!appointment) return null;

    const [dto] = await this.toDTOs([appointment]);
    return dto;
  }

  getStats(branchId?: number): Promise<AppointmentStatusCount[]> {
    return this.repository.countByStatus(branchId);
  }

  /**
   * Traduce los filtros del endpoint a una única consulta compuesta: todo se
   * combina con AND, salvo la búsqueda de texto, que es un OR entre el detalle
   * y el nombre del invitado.
   */
  private buildFilter(query: AppointmentQueryDTO): WhereFilter<IAppointment> | undefined {
    const conditions: WhereFilter<IAppointment>[] = [];

    if (query.branchId !== undefined) conditions.push({ fkBranch: query.branchId });
    if (query.clientId !== undefined) conditions.push({ fkClient: query.clientId });
    if (query.status !== undefined) conditions.push({ status: query.status });
    if (query.from) conditions.push({ scheduledAt: { gte: new Date(query.from) } });
    if (query.to) conditions.push({ scheduledAt: { lte: new Date(query.to) } });
    if (query.onlyGuests) conditions.push({ fkClient: { isNull: true } });

    if (query.search) {
      conditions.push({
        $or: [
          { details: { ilike: `%${query.search}%` } },
          { guestName: { ilike: `%${query.search}%` } },
        ],
      });
    }

    return conditions.length > 0 ? { $and: conditions } : undefined;
  }

  // -------------------------------------------------------------- escritura -

  /**
   * Alta de una cita.
   *
   * Va en una transacción aunque escriba en una sola tabla, que es la excepción
   * al criterio de `IUnitOfWork`: no se abre por escribir en dos sitios sino
   * porque **la decisión de escribir depende de lo que se acaba de leer**. Sin
   * ella, dos peticiones simultáneas comprueban el mismo hueco libre, las dos
   * concluyen que pueden agendar y las dos agendan.
   *
   * El bloqueo es sobre la sucursal, no sobre la cita: es la fila que comparten
   * los que compiten por el mismo horario, y bloquearla deja pasar en paralelo
   * las altas de otras sucursales.
   */
  async create(appointment: CreateAppointmentDTO): Promise<AppointmentDTO> {
    const scheduledAt = new Date(appointment.scheduledAt);
    if (scheduledAt.getTime() <= Date.now()) {
      throw new AppError("La cita debe agendarse en el futuro", 400);
    }

    const durationMin = appointment.durationMin ?? DEFAULT_DURATION_MIN;

    const created = await this.runGuardingSlot(appointment.branchId, () =>
      this.unitOfWork.execute(async (scope) => {
        const repositories = this.scopedRepositories(scope);

        // Primera sentencia de la transacción, y tiene que serlo: ver la nota
        // sobre instantáneas en `ITransactionScope.lockRow`. No se mira lo que
        // devuelve porque el error de "no existe" lo da `requireBranch`, que
        // además distingue la sucursal dada de baja.
        await scope.lockRow(ENTITY_NAMES.BRANCHES, appointment.branchId);

        await this.requireBranch(repositories.branches, appointment.branchId);

        const guestName = (appointment.guestName ?? "").trim();
        if (appointment.clientId != null) {
          await this.requireClient(repositories.users, appointment.clientId);
        } else if (guestName.length === 0) {
          throw new AppError(
            "Indica un cliente registrado o el nombre con el que se agenda la cita",
            400
          );
        }

        await this.assertSlotIsFree(
          repositories.appointments,
          appointment.branchId,
          scheduledAt,
          durationMin
        );

        return repositories.appointments.insert({
          fkBranch: appointment.branchId,
          fkClient: appointment.clientId ?? null,
          // Con cliente registrado el nombre sale del Include, no se duplica aquí.
          guestName: appointment.clientId != null ? null : guestName,
          scheduledAt,
          durationMin,
          status: appointment.status ?? "PENDING",
          details: appointment.details ?? null,
        });
      })
    );

    this.logger.info("Cita creada", { id: created.pkAppointment });
    // La proyección va fuera de la transacción: son lecturas que no deciden
    // nada, y mantenerlas dentro sólo alargaría el bloqueo de la sucursal.
    const [dto] = await this.toDTOs([created]);
    return dto;
  }

  /**
   * Edición de una cita. Mismo razonamiento que `create`: reagendar decide en
   * función de lo que lee, así que va bloqueando la sucursal de destino.
   */
  async update(id: number, changes: UpdateAppointmentDTO): Promise<AppointmentDTO | null> {
    // Lectura previa con un único fin: saber qué sucursal hay que bloquear. La
    // decisión no se toma con esto —puede quedarse viejo—, sino con la relectura
    // que se hace ya dentro de la transacción.
    const existing = await this.repository.getById(id);
    if (!existing) return null;

    const targetBranch = changes.branchId ?? existing.fkBranch;

    const updated = await this.runGuardingSlot(targetBranch, () =>
      this.unitOfWork.execute(async (scope) => {
        const repositories = this.scopedRepositories(scope);

        await scope.lockRow(ENTITY_NAMES.BRANCHES, targetBranch);

        const current = await repositories.appointments.getById(id);
        if (!current) return null;

        // Se valida sobre el resultado combinado, no sobre el parche: un PATCH
        // que sólo trae la hora sigue teniendo que cumplir todas las reglas.
        const merged = {
          fkBranch: changes.branchId ?? current.fkBranch,
          fkClient:
            changes.clientId !== undefined ? changes.clientId ?? null : current.fkClient ?? null,
          guestName:
            changes.guestName !== undefined
              ? (changes.guestName ?? "").trim() || null
              : current.guestName ?? null,
          scheduledAt: changes.scheduledAt ? new Date(changes.scheduledAt) : current.scheduledAt,
          durationMin: changes.durationMin ?? current.durationMin,
          status: changes.status ?? current.status,
          details: changes.details !== undefined ? changes.details : current.details ?? null,
        };

        // La cita se movió de sucursal entre la lectura previa y el bloqueo, así
        // que lo que está bloqueado no es lo que hay que comprobar. Tomar
        // también el otro bloqueo abriría la puerta a un interbloqueo con quien
        // los pida al revés; se pide reintentar, que es lo honesto y lo que hace
        // cualquier control optimista.
        if (merged.fkBranch !== targetBranch) {
          throw new AppError(
            "La cita cambió de sucursal mientras se actualizaba. Vuelve a intentarlo.",
            409,
            true,
            { code: "APPOINTMENT_MOVED" }
          );
        }

        if (merged.fkClient == null && !merged.guestName) {
          throw new AppError(
            "Indica un cliente registrado o el nombre con el que se agenda la cita",
            400
          );
        }

        if (changes.branchId !== undefined) {
          await this.requireBranch(repositories.branches, merged.fkBranch);
        }
        if (changes.clientId != null) {
          await this.requireClient(repositories.users, changes.clientId);
        }

        if (merged.fkClient != null) merged.guestName = null;

        // El solape sólo se recomprueba si la cita se mueve en el tiempo o de
        // sucursal; cambiar el detalle no puede provocarlo.
        const rescheduled =
          changes.scheduledAt !== undefined ||
          changes.durationMin !== undefined ||
          changes.branchId !== undefined;

        if (rescheduled && merged.status !== "CANCELLED") {
          await this.assertSlotIsFree(
            repositories.appointments,
            merged.fkBranch,
            merged.scheduledAt,
            merged.durationMin,
            id
          );
        }

        return repositories.appointments.update(id, merged);
      })
    );

    if (!updated) return null;

    const [dto] = await this.toDTOs([updated]);
    return dto;
  }

  /** Borrado lógico: la cita desaparece de la agenda pero queda el histórico. */
  softDelete(id: number): Promise<boolean> {
    return this.repository.softDelete(id);
  }

  restore(id: number): Promise<boolean> {
    return this.repository.restore(id);
  }

  /**
   * Borrado físico. Nadie referencia una cita, así que es una sola sentencia y
   * no hace falta transacción.
   */
  hardDelete(id: number): Promise<boolean> {
    return this.repository.hardDelete(id);
  }

  // -------------------------------------------------------- reglas de negocio

  /**
   * Última red: la restricción de la base.
   *
   * El bloqueo serializa a las peticiones de este proceso, pero con varias
   * instancias corriendo la garantía la da el índice único de `APPOINTMENTS`. Su
   * violación llega aquí como el 409 genérico de duplicado, y este envoltorio la
   * traduce al mismo mensaje que habría dado la comprobación, para que el
   * cliente vea lo mismo gane o pierda la carrera.
   */
  private async runGuardingSlot<R>(fkBranch: number, work: () => Promise<R>): Promise<R> {
    try {
      return await work();
    } catch (error) {
      if (normalizeError(error).code !== "DB_UNIQUE_VIOLATION") throw error;

      throw new AppError(`La sucursal ${fkBranch} ya tiene una cita en ese horario`, 409, true, {
        code: "APPOINTMENT_OVERLAP",
        cause: error,
      });
    }
  }

  private async requireBranch(
    branches: IGenericRepository<IBranch>,
    id: number
  ): Promise<IBranch> {
    const branch = await branches.getById(id);
    if (!branch) {
      throw new AppError(`La sucursal ${id} no existe o está dada de baja`, 400);
    }
    return branch;
  }

  private async requireClient(users: IGenericRepository<IUser>, id: number): Promise<IUser> {
    const client = await users.getById(id);
    if (!client) {
      throw new AppError(`El cliente ${id} no existe o está dado de baja`, 400);
    }
    if (client.isClient === false) {
      throw new AppError(`El usuario ${id} no está dado de alta como cliente`, 400);
    }
    return client;
  }

  /**
   * Impide agendar dos citas solapadas en la misma sucursal.
   *
   * El solape no se puede expresar como filtro —depende de `scheduledAt` más la
   * duración de *cada* fila—, así que se acota la ventana con una consulta
   * compuesta (como mucho la duración máxima permitida hacia atrás) y se
   * comprueba el cruce en memoria sobre esas pocas candidatas.
   */
  private async assertSlotIsFree(
    appointments: IGenericRepository<IAppointment>,
    fkBranch: number,
    start: Date,
    durationMin: number,
    excludeId?: number
  ): Promise<void> {
    const startMs = start.getTime();
    const endMs = startMs + durationMin * MINUTE_MS;
    const windowStart = new Date(startMs - MAX_DURATION_MIN * MINUTE_MS);

    const conditions: WhereFilter<IAppointment>[] = [
      { fkBranch },
      { scheduledAt: { gte: windowStart, lt: new Date(endMs) } },
      { status: { notIn: ["CANCELLED"] } },
    ];
    if (excludeId !== undefined) conditions.push({ pkAppointment: { ne: excludeId } });

    const candidates = await appointments.find({ where: { $and: conditions } });

    const conflict = candidates.find((candidate) => {
      const otherStart = new Date(candidate.scheduledAt).getTime();
      const otherEnd = otherStart + candidate.durationMin * MINUTE_MS;
      return otherStart < endMs && otherEnd > startMs;
    });

    if (conflict) {
      throw new AppError(
        `La sucursal ya tiene la cita #${conflict.pkAppointment} en ese horario`,
        409
      );
    }
  }

  // ------------------------------------------------------------- proyección --

  /**
   * Materializa las citas con sus relaciones resueltas.
   *
   * Dos consultas extra como mucho para toda la página, no una por fila: es lo
   * mismo que hace EF al traducir un `Include`.
   */
  private async toDTOs(appointments: IAppointment[]): Promise<AppointmentDTO[]> {
    if (appointments.length === 0) return [];

    // Sucursales: el repositorio genérico resuelve el lote con un IN (...).
    // `withDeleted` para que una cita siga mostrando su sucursal aunque ésta se
    // haya dado de baja.
    const branches = await loadRelated<IAppointment, IBranch>(appointments, {
      foreignKey: "fkBranch",
      relatedKey: "pkBranch",
      repository: this.branchesRepository,
    });

    // Clientes: mismo Include, una sola consulta con IN (...). Antes había que
    // pedirlos de uno en uno porque el módulo de usuarios tenía su propio
    // contrato; ahora comparte el repositorio genérico.
    const clients = await loadRelated<IAppointment, IUser>(appointments, {
      foreignKey: "fkClient",
      relatedKey: "pkUser",
      repository: this.usersRepository,
    });

    return appointments.map((appointment) => {
      const branch = branches.get(appointment.fkBranch) ?? null;
      const client =
        appointment.fkClient != null ? clients.get(appointment.fkClient) ?? null : null;

      // El mapeador cubre lo que sale de la propia cita; los nombres vienen de
      // las relaciones ya resueltas y se añaden encima.
      return {
        ...appointmentMapper.toDTO(appointment),
        branchName: branch?.name ?? null,
        clientName: client?.name ?? null,
        displayName: client?.name ?? appointment.guestName ?? "Sin nombre",
      };
    });
  }
}
