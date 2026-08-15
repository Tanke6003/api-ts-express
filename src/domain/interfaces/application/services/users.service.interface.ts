// src/domain/interfaces/services/users.service.interface.ts

import type { ICrudService } from "../../../../application/services/crud.service";
import type { UserDTO } from "../../../../application/dtos/users.dtos";

/**
 * Usuarios no añade nada al CRUD, así que su contrato es el genérico. Cuando
 * aparezca una consulta propia se declara aquí, encima.
 */
export type IUsersService = ICrudService<UserDTO>;
