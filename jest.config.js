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
    "!src/**/index.ts"
  ],

  // 👇 aquí le decimos que lo guarde en reports/
  coverageDirectory: "reports/coverage",
  coverageReporters: ["json", "lcov", "text", "html"],

  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },

  setupFiles: ["reflect-metadata"]
};
