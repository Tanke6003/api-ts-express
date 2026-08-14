// tests/unit/core/config/api.config.unit.test.ts
import type { IEnvs } from "../../../../src/domain/interfaces/infrastructure/plugins/envs.plugin.interface";
import {
  DEFAULT_API_PREFIX,
  DEFAULT_LEGACY_PREFIX,
  resolveApiPrefix,
  resolveLegacyPrefix,
} from "../../../../src/core/config/api.config";

const envsOf = (values: Record<string, string> = {}): IEnvs => ({
  getEnv: (key: string) => values[key] ?? "",
});

describe("api.config", () => {
  describe("resolveApiPrefix", () => {
    it("cae a /api/v1 sin configuración", () => {
      expect(resolveApiPrefix(envsOf())).toBe(DEFAULT_API_PREFIX);
    });

    it("respeta el prefijo configurado", () => {
      expect(resolveApiPrefix(envsOf({ API_PREFIX: "/servicio-citas/api/v1" }))).toBe(
        "/servicio-citas/api/v1"
      );
    });

    it("normaliza la barra inicial y la final", () => {
      expect(resolveApiPrefix(envsOf({ API_PREFIX: "api/v2" }))).toBe("/api/v2");
      expect(resolveApiPrefix(envsOf({ API_PREFIX: "/api/v2/" }))).toBe("/api/v2");
      expect(resolveApiPrefix(envsOf({ API_PREFIX: "  /api/v2  " }))).toBe("/api/v2");
    });

    it("una barra suelta o el vacío valen como no configurado", () => {
      expect(resolveApiPrefix(envsOf({ API_PREFIX: "/" }))).toBe(DEFAULT_API_PREFIX);
      expect(resolveApiPrefix(envsOf({ API_PREFIX: "   " }))).toBe(DEFAULT_API_PREFIX);
    });
  });

  describe("resolveLegacyPrefix", () => {
    it("monta /api por defecto", () => {
      expect(resolveLegacyPrefix(envsOf())).toBe(DEFAULT_LEGACY_PREFIX);
    });

    it("se apaga con `off`, no dejándolo vacío", () => {
      expect(resolveLegacyPrefix(envsOf({ API_LEGACY_PREFIX: "off" }))).toBeNull();
      expect(resolveLegacyPrefix(envsOf({ API_LEGACY_PREFIX: "OFF" }))).toBeNull();
      // Vacío es indistinguible de "no definida", así que vale el defecto: si no,
      // borrar la línea del fichero apagaría el alias sin que nadie lo pidiera.
      expect(resolveLegacyPrefix(envsOf({ API_LEGACY_PREFIX: "" }))).toBe(DEFAULT_LEGACY_PREFIX);
    });

    it("no se monta si coincide con el prefijo principal", () => {
      // Montar el mismo router dos veces en la misma ruta duplicaría cada
      // petición; es lo que pasaría con API_PREFIX=/api y el alias por defecto.
      expect(resolveLegacyPrefix(envsOf({ API_PREFIX: "/api" }))).toBeNull();
    });

    it("acepta un alias propio", () => {
      expect(resolveLegacyPrefix(envsOf({ API_LEGACY_PREFIX: "/rest/" }))).toBe("/rest");
    });
  });
});
