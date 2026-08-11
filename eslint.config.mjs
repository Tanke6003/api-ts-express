// eslint.config.mjs
//
// Extensión .mjs a propósito: el fichero usa `import`, y en un paquete sin
// "type": "module" Node avisaba en cada ejecución de que lo estaba tratando
// como CommonJS. Poner "type": "module" en package.json no es opción, porque el
// build de TypeScript emite CommonJS.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

/** Reglas de estilo comunes a todo el código del repositorio. */
const estilo = {
  semi: ["error", "always"],
  quotes: ["error", "double", { avoidEscape: true }],
  "no-var": "error",
  "prefer-const": "error",
  // `==` con null es el único caso que se acepta: cubre null y undefined a la vez.
  eqeqeq: ["error", "smart"],
  "no-unused-vars": "off",
};

export default [
  {
    // Nada de esto es código fuente: son artefactos o dependencias.
    ignores: ["dist/**", "coverage/**", "reports/**", "node_modules/**"],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        // Da acceso a los tipos, que es lo que permite detectar las promesas
        // sin await. Es más lento que el análisis sintáctico, pero es la
        // diferencia entre comprobar el estilo y comprobar el comportamiento.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      ...estilo,
      "@typescript-eslint/no-explicit-any": "warn",
      // El guion bajo es la forma de decir "aquí hace falta el parámetro pero
      // no se usa": el middleware de errores de Express necesita los cuatro
      // argumentos para que Express lo reconozca como tal.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // Las tres que justifican el análisis con tipos: una promesa sin await
      // dentro de un try/catch se traga el error y la petición responde 200
      // mientras la escritura falla en segundo plano.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      // El logger inyectado es la vía; `console` se escapa de los transportes,
      // del nivel configurado y del id de petición.
      "no-console": "warn",
    },
  },

  {
    // Los tests son código y se revisan igual, con dos permisos: `any` en los
    // dobles ahorra reconstruir tipos enteros, y aquí no hay logger que usar.
    files: ["tests/**/*.ts"],
    languageOptions: { parser: tseslint.parser },
    rules: {
      ...estilo,
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-console": "off",
    },
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
        Intl: "readonly",
        console: "readonly",
      },
    },
    rules: estilo,
  },
];
