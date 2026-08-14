import { MongoGenericRepository } from "../../../../../src/infrastructure/repositories/base/drivers/mongo.generic.repository";
import { FakeMongoDataSource } from "./fake-mongo";
import { silentLogger } from "./fake-sql-executor";
import {
  CONTRACT_ENTITY,
  ContractItem,
  runGenericRepositoryContract,
} from "../../../../contract/generic-repository.contract";

/**
 * MongoDB es el único motor que no comparte implementación con ninguno: no usa
 * `SqlGenericRepository`. Pasarle la misma batería que al resto es lo que
 * garantiza que un módulo escrito contra el contrato se comporte igual aquí.
 *
 * El doble de la colección evalúa de verdad las consultas generadas y rechaza
 * cualquier operador que el traductor no debería emitir, así que lo que se
 * comprueba es la traducción real, no un mock complaciente.
 */
runGenericRepositoryContract("mongodb", {
  create: () =>
    new MongoGenericRepository<ContractItem>(
      new FakeMongoDataSource(),
      CONTRACT_ENTITY,
      silentLogger
    ),
});
