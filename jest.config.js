module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",

  testMatch: [
    "**/tests/unit/**/*.test.ts",
    "**/tests/integration/**/*.test.ts",
    // "**/tests/e2e/**/*.test.ts"
  ],

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
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/main.ts",
    "!src/**/index.ts",
    "!src/core/di/container.ts",
    "!src/**/*.interface.ts",
    "!src/**/config/*.ts",
  ],

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

  setupFiles: ["reflect-metadata"],
};
