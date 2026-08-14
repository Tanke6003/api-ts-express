import {
  REQUEST_ID_HEADER,
  requestContext,
  currentUserName,
  toCurrentUser,
} from "../../../../src/presentation/middlewares/requestContext.middleware";
import { AsyncRequestContextPlugin } from "../../../../src/infrastructure/plugins/asyncRequestContext.plugin";

describe("toCurrentUser", () => {
  it("saca id, nombre y email de los claims habituales", () => {
    expect(toCurrentUser({ sub: "7", name: "Ruben", email: "r@example.com" })).toEqual({
      id: "7",
      name: "Ruben",
      email: "r@example.com",
    });
  });

  it("acepta un id numérico", () => {
    expect(toCurrentUser({ userId: 42, name: "Ana" })?.id).toBe("42");
  });

  it("prueba varios nombres de claim, en orden", () => {
    expect(toCurrentUser({ sub: "1", preferred_username: "rfarias" })?.name).toBe("rfarias");
    expect(toCurrentUser({ sub: "1", samaccountname: "DOMINIO\\rfarias" })?.name).toBe(
      "DOMINIO\\rfarias"
    );
  });

  // Mejor identificar al autor por su email o su id que registrar "System".
  it("cae al email y luego al id cuando no hay nombre", () => {
    expect(toCurrentUser({ sub: "7", email: "r@example.com" })?.name).toBe("r@example.com");
    expect(toCurrentUser({ sub: "7" })?.name).toBe("7");
  });

  it("devuelve null si el token no identifica a nadie", () => {
    expect(toCurrentUser({})).toBeNull();
    expect(toCurrentUser(undefined)).toBeNull();
    expect(toCurrentUser("un-string")).toBeNull();
    expect(toCurrentUser({ name: "   " })).toBeNull();
  });
});

describe("requestContext middleware", () => {
  let context: AsyncRequestContextPlugin;
  let res: any;

  beforeEach(() => {
    context = new AsyncRequestContextPlugin();
    res = { setHeader: jest.fn() };
  });

  it("abre el contexto y expone el id por cabecera", () => {
    const seen: string[] = [];

    requestContext(context)({ headers: {} } as never, res, () => {
      seen.push(context.getRequestId()!);
    });

    expect(seen[0]).toEqual(expect.any(String));
    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, seen[0]);
  });

  // Permite seguir una operación a través de varios servicios.
  it("respeta el id que llega de un proxy", () => {
    requestContext(context)({ headers: { [REQUEST_ID_HEADER]: "trace-99" } } as never, res, () => {
      expect(context.getRequestId()).toBe("trace-99");
    });

    expect(res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, "trace-99");
  });

  it("genera un id distinto por petición", () => {
    const ids: string[] = [];
    const middleware = requestContext(context);

    middleware({ headers: {} } as never, res, () => ids.push(context.getRequestId()!));
    middleware({ headers: {} } as never, res, () => ids.push(context.getRequestId()!));

    expect(ids[0]).not.toBe(ids[1]);
  });

  it("empieza sin usuario: el guard de JWT lo rellena después", () => {
    requestContext(context)({ headers: {} } as never, res, () => {
      expect(context.getCurrentUser()).toBeNull();
      expect(context.getCurrentUserId()).toBeNull();
      expect(context.getCurrentUserName()).toBe("System");
    });
  });

  it("sobrevive a los await, que es lo que lo hace útil en las capas de abajo", async () => {
    await new Promise<void>((resolve) => {
      requestContext(context)({ headers: {} } as never, res, async () => {
        const before = context.getRequestId();
        await Promise.resolve();
        await new Promise((r) => setTimeout(r, 1));

        expect(context.getRequestId()).toBe(before);
        resolve();
      });
    });
  });

  // Dos peticiones a la vez no pueden verse el usuario la una a la otra.
  it("aísla peticiones concurrentes", async () => {
    const middleware = requestContext(context);

    const run = (name: string, delay: number) =>
      new Promise<string>((resolve) => {
        middleware({ headers: {} } as never, res, async () => {
          const store = context.get()!;
          store.user = { id: name, name, email: null };
          await new Promise((r) => setTimeout(r, delay));
          resolve(context.getCurrentUserName());
        });
      });

    expect(await Promise.all([run("Ana", 5), run("Beto", 1)])).toEqual(["Ana", "Beto"]);
  });

  it("fuera de toda petición no hay contexto", () => {
    expect(context.get()).toBeUndefined();
    expect(context.getCurrentUserName()).toBe("System");
    expect(currentUserName(context)).toBe("System");
  });
});
