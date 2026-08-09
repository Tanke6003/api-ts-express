import { JwtPlugin } from "../../../../src/infrastructure/plugins/jwt.plugin";
import { Request, Response, NextFunction } from 'express';
import { IEnvs } from "../../../../src/domain/interfaces/infrastructure/plugins/envs.plugin.interface";

describe("JWTPlugin", () => {
  let jwtPlugin: JwtPlugin;

  // Mock de IEnvs inyectado por constructor (sin service locator)
  const mockEnvs: IEnvs = {
    getEnv: (key: string) => (key === "JWT_SECRET" ? "unit-test-secret" : ""),
  };

  beforeEach(() => {
    jwtPlugin = new JwtPlugin(mockEnvs);
  });

  it("should throw if JWT_SECRET is not set (no insecure default)", () => {
    const envsWithoutSecret: IEnvs = { getEnv: () => "" };
    expect(() => new JwtPlugin(envsWithoutSecret)).toThrow(/JWT_SECRET is not set/);
  });

  it("should create a token string", () => {
    const token = jwtPlugin.generateToken({ userId: 1 });
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
  });

  it("should return a token with the correct properties", () => {
    const payload = { userId: 123, role: "admin" };
    const token = jwtPlugin.generateToken(payload);
    const decoded = jwtPlugin.verifyToken(token) as any;

    expect(decoded.userId).toBe(payload.userId);
    expect(decoded.role).toBe(payload.role);
    expect(decoded.exp).toBeDefined();
  });

  it("middleware should call next() if token is valid", () => {
    const token = jwtPlugin.generateToken({ userId: 42 });

    const req = { headers: { authorization: `Bearer ${token}` } } as unknown as Request;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
    const next = jest.fn() as NextFunction;

    jwtPlugin.middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect((req as any).user.userId).toBe(42);
  });

  it("middleware should return 401 if no token is provided", () => {
    const req = { headers: {} } as unknown as Request;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
    const next = jest.fn() as NextFunction;

    jwtPlugin.middleware(req, res, next);

    // Delega en el manejador global para que el 401 tenga el mismo formato que
    // el resto de errores de la API.
    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 401, code: "NO_TOKEN" })
    );
  });

  it("middleware should return 401 if token is invalid", () => {
    const req = { headers: { authorization: `Bearer invalidtoken` } } as unknown as Request;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
    const next = jest.fn() as NextFunction;

    jwtPlugin.middleware(req, res, next);

    // El error de jsonwebtoken viaja tal cual: el manejador global distingue
    // "expirado" de "invalido" por su name.
    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ name: "JsonWebTokenError" })
    );
  });
});
