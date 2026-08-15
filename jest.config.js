module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",

  // Dos niveles, y la frontera es dónde vive la lógica:
  //
  //   unit  la maquinaria compartida (CRUD genérico, enrutado, repositorio
  //         base, dialectos, errores) y las reglas de negocio propias de un
  //         módulo, que son las que tienen casos límite.
  //   e2e   el flujo de cada entidad por HTTP, de la ruta a la base en memoria.
  //
  // Un módulo sin reglas propias no lleva test unitario: probar su pase a
  // través sería probar el framework a través de algo que no añade nada.
  testMatch: ["**/tests/unit/**/*.test.ts", "**/tests/e2e/**/*.test.ts"],

  reporters: [
    "default",
    [
      "jest-html-reporter",
      {
        pageTitle: "API TS Express — Test Report",
        outputPath: "reports/tests-report.html",
        includeFailureMsg: true,
        includeSuiteFailure: true,
        includeConsoleLog: true,
        includeCoverage: true,
      },
    ],
  ],

  collectCoverage: true,
  // Sólo se excluye lo que **no tiene código que ejecutar**: las declaraciones
  // de tipos, que desaparecen al compilar.
  //
  // Todo lo demás cuenta aunque no tenga un test, y aparece al 0 %. Antes se
  // excluían `config/`, los barriles, el contenedor y `main.ts`, y eso no subía
  // la calidad: escondía el arranque, el apagado y la política de seguridad,
  // que son justo el código donde un fallo no lo ve nadie hasta producción.
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.d.ts", "!src/**/*.interface.ts"],

  coverageDirectory: "reports/coverage",
  coverageReporters: ["json", "lcov", "text", "text-summary", "html"],

  coverageThreshold: {
    "./src/application/": {
      branches: 85,
      functions: 90,
      lines: 90,
      statements: 90,
    },
    "./src/infrastructure/": {
      branches: 65,
      functions: 88,
      lines: 88,
      statements: 88,
    },
    "./src/presentation/": {
      branches: 80,
      functions: 90,
      lines: 90,
      statements: 90,
    },
  },

  setupFiles: ["reflect-metadata", "<rootDir>/tests/setup/test-env.ts"],
};
