// src/presentation/controllers/users.controller.ts
import { inject, injectable } from "tsyringe";
import type { IUsersController } from "../../domain/interfaces/presentation/controllers/users.controller.interface";
import type { IUsersService } from "../../domain/interfaces/application/services/users.service.interface";
import type { IRequestContext } from "../../domain/interfaces/infrastructure/plugins/request-context.plugin.interface";
import {
  createUserSchema,
  paginationSchema,
  updateUserSchema,
} from "../../application/validators/users.validators";
import { CrudController } from "./crud.controller";
import { ApiController } from "../routing/route.decorators";
import { Crud } from "../routing/crud.decorator";
import { TOKENS } from "../../core/di/tokens";

/**
 * Usuarios. El módulo entero es esta declaración.
 *
 * Los cinco manejadores vienen de `CrudController` y las cinco rutas —con su
 * validación y su documentación— de `@Crud`. Para quedarse con un verbo propio
 * se saca de `verbs` y se declara aquí con su decorador.
 */
@injectable()
@ApiController("/users", { tag: "Users", token: TOKENS.IUsersController })
@Crud({
  resource: "el usuario",
  dto: "User",
  schemas: { create: createUserSchema, update: updateUserSchema, query: paginationSchema },
})
export class UsersController extends CrudController implements IUsersController {
  constructor(
    @inject(TOKENS.IUsersService) service: IUsersService,
    @inject(TOKENS.IRequestContext) context: IRequestContext
  ) {
    super(service, context, "el usuario");
  }
}
