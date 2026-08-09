// tests/unit/presentation/middlewares/errorHandler.unit.test.ts
import { container } from "tsyringe";
import { ZodError, z } from "zod";
import {
  errorHandler,
  notFoundHandler,
} from "../../../../src/presentation/middlewares/errorHandler.middleware";
import { AppError } from "../../../../src/core/errors/app-error";

describe("errorHandler middleware", () => {
  let mockReq: any;
  let mockRes: any;
  let mockNext: jest.Mock;
  let logger: { error: jest.Mock; warn: jest.Mock; info: jest.Mock; debug: jest.Mock };

  const body = () => mockRes.json.mock.calls[0][0];

  beforeEach(() => {
    container.reset();
    logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() };
    container.register("ILogger", { useValue: logger });

    mockReq = { method: "GET", originalUrl: "/api/users/9", headers: {} };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
  });

  // =====================================================  errores de negocio ==
  it("respeta el statusCode y el mensaje de un AppError", () => {
    errorHandler(new AppError("User not found", 404), mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(404);
    expect(body()).toMatchObject({
      status: "error",
      code: "NOT_FOUND",
      message: "User not found",
      path: "/api/users/9",
      method: "GET",
    });
    expect(body().timestamp).toEqual(expect.any(String));
  });

  it("usa el código explícito del AppError cuando lo trae", () => {
    const error = new AppError("Ya hay una cita", 409, true, { code: "APPOINTMENT_OVERLAP" });

    errorHandler(error, mockReq, mockRes, mockNext);

    expect(body().code).toBe("APPOINTMENT_OVERLAP");
  });

  it("incluye los errores de campo cuando los hay", () => {
    const error = new AppError("Validation failed", 400, true, {
      errors: [{ field: "name", message: "requerido" }],
    });

    errorHandler(error, mockReq, mockRes, mockNext);

    expect(body().errors).toEqual([{ field: "name", message: "requerido" }]);
  });

  it("un AppError con status por defecto responde 500", () => {
    errorHandler(new AppError("Generic failure"), mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(body().message).toBe("Generic failure");
  });

  // ========================================================  otros orígenes ===
  it("traduce un ZodError a 400 con el detalle por campo", () => {
    const parsed = z.object({ name: z.string() }).safeParse({});

    errorHandler((parsed as { error: ZodError }).error, mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(body().code).toBe("VALIDATION_ERROR");
    expect(body().errors[0].field).toBe("name");
  });

  it("traduce un token expirado a 401", () => {
    const error = Object.assign(new Error("jwt expired"), { name: "TokenExpiredError" });

    errorHandler(error, mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(body().code).toBe("TOKEN_EXPIRED");
  });

  it("traduce un JSON mal formado a 400", () => {
    const error = Object.assign(new SyntaxError("Unexpected token"), {
      type: "entity.parse.failed",
    });

    errorHandler(error, mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(400);
    expect(body().code).toBe("MALFORMED_JSON");
  });

  // El motivo real llega envuelto en dos capas de repositorio; se busca en toda
  // la cadena de `cause`.
  it("reconoce una violación de unicidad de Oracle a través de la cadena de causas", () => {
    const driverError = new Error("ORA-00001: unique constraint (APPUSER.PK_USERS) violated");
    const pluginError = new Error("[OraclePlugin] execute failed", { cause: driverError });
    const repositoryError = new Error("UsersRepository.insert failed.", { cause: pluginError });

    errorHandler(repositoryError, mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(409);
    expect(body().code).toBe("DB_UNIQUE_VIOLATION");
  });

  it("traduce una base caída a 503", () => {
    const error = new Error("wrapped", { cause: new Error("ORA-12541: TNS:no listener") });

    errorHandler(error, mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(503);
    expect(body().code).toBe("DB_UNAVAILABLE");
  });

  it("un error inesperado responde 500 genérico", () => {
    errorHandler(new Error("Unexpected crash"), mockReq, mockRes, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(500);
    expect(body()).toMatchObject({ code: "INTERNAL_ERROR", message: "Internal server error" });
  });

  // =============================================================  filtrado ====
  it("en producción no expone el mensaje interno ni la traza", () => {
    process.env.NODE_ENV = "production";

    errorHandler(new Error("connection string is postgres://user:pass@host"), mockReq, mockRes, mockNext);

    expect(body().message).toBe("Internal server error");
    expect(body().stack).toBeUndefined();
    expect(body().causes).toBeUndefined();
  });

  it("fuera de producción incluye traza y causas para poder depurar", () => {
    const error = new Error("boom", { cause: new Error("raíz") });

    errorHandler(error, mockReq, mockRes, mockNext);

    expect(Array.isArray(body().stack)).toBe(true);
    expect(body().causes).toEqual(["Error: raíz"]);
  });

  // ===============================================================  logging ==
  it("registra los 5xx como error y los 4xx como aviso", () => {
    errorHandler(new Error("boom"), mockReq, mockRes, mockNext);
    expect(logger.error).toHaveBeenCalledWith("Request failed", expect.any(Object));

    errorHandler(new AppError("nope", 404), mockReq, mockRes, mockNext);
    expect(logger.warn).toHaveBeenCalledWith("Request rejected", expect.any(Object));
  });

  it("responde aunque el contenedor no tenga logger registrado", () => {
    container.reset();

    expect(() => errorHandler(new AppError("x", 400), mockReq, mockRes, mockNext)).not.toThrow();
    expect(mockRes.status).toHaveBeenCalledWith(400);
  });

  it("arrastra el id de petición recibido por cabecera", () => {
    mockReq.headers = { "x-request-id": "abc-123" };

    errorHandler(new AppError("x", 400), mockReq, mockRes, mockNext);

    expect(body().requestId).toBe("abc-123");
  });
});

describe("notFoundHandler", () => {
  it("convierte una ruta desconocida en un AppError 404", () => {
    const next = jest.fn();

    notFoundHandler(
      { method: "GET", originalUrl: "/api/nope" } as never,
      {} as never,
      next
    );

    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({
      statusCode: 404,
      code: "ROUTE_NOT_FOUND",
      message: "Cannot GET /api/nope",
    });
  });
});
