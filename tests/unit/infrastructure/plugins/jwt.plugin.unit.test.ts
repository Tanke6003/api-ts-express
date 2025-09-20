import { JwtPlugin } from "../../../../src/infrastructure/plugins/jwt.plugin";
import { Request, Response, NextFunction } from 'express';

describe("JWTPlugin", () => {
  const jwtPlugin = new JwtPlugin();

  it("it should create a token string", () => {
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

    // Cast seguro para tests
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

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "No token provided" });
    expect(next).not.toHaveBeenCalled();
  });

  it("middleware should return 401 if token is invalid", () => {
    const req = { headers: { authorization: `Bearer invalidtoken` } } as unknown as Request;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() } as unknown as Response;
    const next = jest.fn() as NextFunction;

    jwtPlugin.middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: "Invalid or expired token" });
    expect(next).not.toHaveBeenCalled();
  });
});
