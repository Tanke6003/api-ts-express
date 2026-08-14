// src/presentation/controllers/users.controller.ts
import { Request, Response, NextFunction } from "express";
import type { IUsersController } from "../../domain/interfaces/presentation/controllers/users.controller.interface";
import type { IUsersService } from "../../domain/interfaces/application/services/users.service.interface";
import { inject, injectable } from "tsyringe";
import { AppError } from "../../core/errors/app-error";
import {
  createUserSchema,
  paginationSchema,
  updateUserSchema,
  type PaginationInput,
} from "../../application/validators/users.validators";
import { BaseController } from "./base.controller";
import type { IRequestContext } from "../../domain/interfaces/infrastructure/plugins/request-context.plugin.interface";
import { TOKENS } from "../../core/di/tokens";
import { ApiController, Delete, Get, Post, Put } from "../routing/route.decorators";

/**
 * Usuarios.
 *
 * Las rutas se declaran aquí, sobre cada manejador, en vez de en un fichero
 * aparte. De estos decoradores salen dos cosas a la vez —el enrutado y el
 * OpenAPI—, y la validación es literalmente el mismo esquema de Zod que
 * documenta el endpoint, así que no pueden discrepar.
 */
@injectable()
@ApiController("/users", { tag: "Users" })
export class UsersController extends BaseController implements IUsersController {
  constructor(
    @inject(TOKENS.IUsersService) private readonly usersService: IUsersService,
    @inject(TOKENS.IRequestContext) context: IRequestContext
  ) {
    super(context);
  }

  @Get("/", {
    summary: "Listado paginado de usuarios",
    query: paginationSchema,
    responses: { 200: "Lista paginada de usuarios" },
  })
  public getAllUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { page, limit } = (req.validatedQuery as PaginationInput | undefined) ?? {
        page: 1,
        limit: 10,
      };
      const result = await this.usersService.getAllUsers({ page, limit });
      res.json(result);
    } catch (err) {
      next(err);
    }
  };

  @Get("/:id", {
    summary: "Obtiene un usuario por id",
    params: { id: "integer" },
    responses: { 200: "Usuario encontrado", 404: "Usuario no encontrado" },
  })
  public getUserById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = Number(req.params.id);
      if (isNaN(userId)) throw new AppError("Invalid user ID", 400);
      const user = await this.usersService.getUserById(userId);
      if (!user) throw new AppError("User not found", 404);
      res.json(user);
    } catch (err) {
      next(err);
    }
  };

  @Post("/", {
    summary: "Crea un usuario",
    body: createUserSchema,
    responses: { 201: "Usuario creado", 400: "Error de validación" },
  })
  public createUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.usersService.createUser(req.body);
      res.status(201).json({ status: "ok", message: "User created" });
    } catch (err) {
      next(err);
    }
  };

  @Put("/:id", {
    summary: "Actualiza un usuario",
    params: { id: "integer" },
    body: updateUserSchema,
    responses: { 200: "Usuario actualizado", 404: "Usuario no encontrado" },
  })
  public updateUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = Number(req.params.id);
      if (isNaN(userId)) throw new AppError("Invalid user ID", 400);
      const updated = await this.usersService.updateUser(userId, req.body);
      if (!updated) throw new AppError("User not found", 404);
      res.json({ status: "ok", message: "User updated" });
    } catch (err) {
      next(err);
    }
  };

  @Delete("/:id", {
    summary: "Baja lógica de un usuario",
    params: { id: "integer" },
    responses: { 204: "Usuario dado de baja", 404: "Usuario no encontrado" },
  })
  public deleteUser = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = Number(req.params.id);
      if (isNaN(userId)) throw new AppError("Invalid user ID", 400);
      const deleted = await this.usersService.deleteUser(userId);
      if (!deleted) throw new AppError("User not found", 404);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };
}
