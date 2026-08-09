import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts"], // 👈 solo .ts
    languageOptions: {
      parser: tseslint.parser
    },
    rules: {
      semi: ["error", "always"],
      quotes: ["error", "double"],
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-explicit-any": "warn" // o "off" si quieres
    }
  },
  {
    // Interfaz web: JavaScript de navegador, no de Node. Sin este bloque, ESLint
    // marcaría document, fetch o location como variables no definidas.
    files: ["public/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        document: "readonly",
        window: "readonly",
        location: "readonly",
        fetch: "readonly",
        sessionStorage: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        confirm: "readonly",
        FormData: "readonly",
        URL: "readonly",
        Intl: "readonly"
      }
    },
    rules: {
      semi: ["error", "always"],
      quotes: ["error", "double"]
    }
  }
];
