import { MemoryGenericRepository } from "../../../../../src/infrastructure/repositories/base/drivers/memory.generic.repository";
import { defineEntity } from "../../../../../src/infrastructure/repositories/base/entity-metadata";
import {
  ContractItem,
  runGenericRepositoryContract,
} from "../../../../contract/generic-repository.contract";

/**
 * Entidad mínima de la batería de contrato, con la convención de la plantilla:
 * PK autonumérica y columna de borrado lógico.
 */
export const CONTRACT_ENTITY = defineEntity<ContractItem>({
  table: "CONTRACT_ITEMS",
  primaryKey: "pkItem",
  identity: true,
  columns: {
    pkItem: { name: "PK_ITEM", kind: "number", insertable: false, updatable: false },
    name: { name: "NAME", kind: "string" },
    qty: { name: "QTY", kind: "number" },
    tag: { name: "TAG", kind: "string" },
    active: { name: "ACTIVE", kind: "boolean" },
  },
  softDelete: { property: "active", activeValue: 1, deletedValue: 0 },
});

// El driver en memoria es la referencia: si la batería pasa aquí, define lo que
// los demás motores tienen que reproducir.
runGenericRepositoryContract("memoria", {
  create: () => new MemoryGenericRepository<ContractItem>(CONTRACT_ENTITY, []),
});
