module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",

  testMatch: [
    "**/tests/unit/**/*.test.ts",
    // "**/tests/integration/**/*.test.ts",
    // "**/tests/e2e/**/*.test.ts"
  ],

  reporters: [
    "default",
    [
      "jest-html-reporter",
      {
        pageTitle: "API TS Express Test Report",
        outputPath: "reports/tests-report.html",
        includeFailureMsg: true,
        includeSuiteFailure: true,
        includeConsoleLog: true,
        includeCoverage: true
      }
    ]
  ],

  collectCoverage: true,
 collectCoverageFrom: [
  "src/**/*.ts",
  "!src/main.ts",
  "!src/**/index.ts",
  "!src/core/di/container.ts",
  "!src/**/*.interface.ts",
  "!src/**/config/*.ts"
],



  // 👇 aquí le decimos que lo guarde en reports/
  coverageDirectory: "reports/coverage",
 coverageReporters: ["json", "lcov", "text", "text-summary", "html"],


  coverageThreshold: {
  // global: {
  //   branches: 75,
  //   functions: 80,
  //   lines: 80,
  //   statements: 80,
  // },

  // Application (lógica de negocio → estricto)
  "./src/application/": {
    branches: 85,
    functions: 90,
    lines: 90,
    statements: 90,
  },

    // infrastructure (plugins, acceso a datos → intermedio)

  "./src/infrastructure/": {
    branches: 70,
    functions: 90,
    lines: 90,
    statements: 90,
  },



  // presentation (API, controladores → menos estricto)
  "./src/presentation/": {
    branches: 80,
    functions: 90,
    lines: 90,
    statements: 90,
  },
},

  setupFiles: ["reflect-metadata"]
};
