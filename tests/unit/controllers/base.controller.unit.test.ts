import { BaseController } from "../../../src/presentation/controllers/base.controller";
import { AsyncRequestContextPlugin } from "../../../src/infrastructure/plugins/asyncRequestContext.plugin";
import { AppError } from "../../../src/core/errors/app-error";

/** Expone los miembros protegidos para poder comprobarlos desde el test. */
class ProbeController extends BaseController {
  constructor(context: AsyncRequestContextPlugin) {
    super(context);
  }

  claims() {
    return {
      user: this.currentUser,
      id: this.userId,
      name: this.userName,
      email: this.userEmail,
      requestId: this.requestId,
    };
  }

  mustHaveUser() {
    return this.requireUserId();
  }
}

describe("BaseController", () => {
  let context: AsyncRequestContextPlugin;
  let controller: ProbeController;

  beforeEach(() => {
    context = new AsyncRequestContextPlugin();
    controller = new ProbeController(context);
  });

  const asUser = <T>(fn: () => T) =>
    context.run(
      { requestId: "req-1", user: { id: "7", name: "Ruben", email: "ruben@example.com" } },
      fn
    );

  it("expone los claims de la petición en curso", () => {
    expect(asUser(() => controller.claims())).toEqual({
      user: { id: "7", name: "Ruben", email: "ruben@example.com" },
      id: "7",
      name: "Ruben",
      email: "ruben@example.com",
      requestId: "req-1",
    });
  });

  it("fuera de una petición no inventa identidad", () => {
    expect(controller.claims()).toEqual({
      user: null,
      id: null,
      name: "System",
      email: null,
      requestId: undefined,
    });
  });

  it("requireUserId devuelve el id cuando hay usuario", () => {
    expect(asUser(() => controller.mustHaveUser())).toBe("7");
  });

  // Mejor un 401 explícito que seguir adelante con `null`.
  it("requireUserId falla con 401 si la petición es anónima", () => {
    expect(() => controller.mustHaveUser()).toThrow(AppError);
    expect(() => controller.mustHaveUser()).toThrow(/No authenticated user/);

    try {
      controller.mustHaveUser();
    } catch (error) {
      expect(error).toMatchObject({ statusCode: 401, code: "NO_AUTHENTICATED_USER" });
    }
  });

  it("una petición autenticada sin id sigue considerándose anónima para requireUserId", () => {
    context.run({ requestId: "r", user: { id: null, name: "Anon", email: null } }, () => {
      expect(controller.userName).toBe("Anon");
      expect(() => controller.mustHaveUser()).toThrow(AppError);
    });
  });
});
