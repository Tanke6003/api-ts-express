// src/core/di/modules/persistence.module.ts
import { container } from "tsyringe";
import type { IUnitOfWork } from "../../../domain/interfaces/infrastructure/repositories/unit-of-work.interface";
import type { IHealthProbe } from "../../../domain/interfaces/infrastructure/plugins/health-probe.interface";
import { HealthProbePlugin } from "../../../infrastructure/plugins/healthProbe.plugin";
import { createPersistenceLayer, type PersistenceLayer } from "../repository.factory";
import type { Plugins } from "./plugins.module";
import { TOKENS } from "../tokens";

/**
 * Un único punto construye los repositorios genéricos de todas las entidades y
 * la unidad de trabajo, sobre el motor que diga `DATA_SOURCE` (memoria, Oracle,
 * SQL Server, PostgreSQL, MySQL o MongoDB). A partir de aquí nadie sabe cuál es:
 * los repositorios de cada entidad reciben su store y hablan el mismo contrato.
 *
 * Devuelve la capa completa porque el arranque y el apagado necesitan la
 * conexión, que no se registra en el contenedor: no es una dependencia que
 * nadie inyecte, es un recurso del proceso.
 */
export function registerPersistence({ envs, logger, requestContext }: Plugins): PersistenceLayer {
  const persistence = createPersistenceLayer(envs, logger, requestContext);

  container.register(TOKENS.UsersStore, { useValue: persistence.stores.users });
  container.register(TOKENS.BranchesStore, { useValue: persistence.stores.branches });
  container.register(TOKENS.AppointmentsStore, { useValue: persistence.stores.appointments });
  container.register(TOKENS.AuditLogStore, { useValue: persistence.stores.auditLog });
  container.register<IUnitOfWork>(TOKENS.IUnitOfWork, { useValue: persistence.unitOfWork });

  // El sondeo se monta aquí porque aquí está la conexión, que no se registra en
  // el contenedor: es un recurso del proceso, no una dependencia que se inyecte.
  container.register<IHealthProbe>(TOKENS.IHealthProbe, {
    useValue: new HealthProbePlugin({
      connection: persistence.connection,
      dataSource: persistence.driver,
    }),
  });

  return persistence;
}
