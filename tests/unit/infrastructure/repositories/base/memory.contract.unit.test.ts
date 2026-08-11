import { MemoryGenericRepository } from "../../../../../src/infrastructure/repositories/base/drivers/memory.generic.repository";
import {
  CONTRACT_ENTITY,
  ContractItem,
  runGenericRepositoryContract,
} from "../../../../contract/generic-repository.contract";

// El driver en memoria es la referencia: si la batería pasa aquí, define lo que
// los demás motores tienen que reproducir.
runGenericRepositoryContract("memoria", {
  create: () => new MemoryGenericRepository<ContractItem>(CONTRACT_ENTITY, []),
});
