// tests/setup/test-env.ts
// Runs (via jest "setupFiles") before each test module is imported, so the
// critical secrets validated at DI-container load are present during tests.
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
