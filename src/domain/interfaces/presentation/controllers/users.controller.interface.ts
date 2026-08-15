// src/domain/interfaces/controllers/users.controller.interface.ts

import type { ICrudController } from "../../../../presentation/controllers/crud.controller";

/** Usuarios expone el CRUD estándar, sin verbos propios. */
export type IUsersController = ICrudController;
