# Contributing Guide

Thank you for contributing to this project! Please follow the guidelines below to keep the codebase consistent and maintainable.

---

## Getting started

1. Fork the repository and clone your fork.
2. Install dependencies: `npm install`
3. Copy the environment template: `cp .env.template .env.dev`
4. Start the dev server: `npm run dev` (Linux/Mac) or `npm run dev:win` (Windows)

For detailed setup instructions see [docs/getting-started.md](../docs/getting-started.md).

---

## Branch naming

| Type | Pattern | Example |
|------|---------|---------|
| Feature | `feat/<short-description>` | `feat/add-auth-middleware` |
| Bug fix | `fix/<short-description>` | `fix/jwt-expiry-handling` |
| Refactor | `refactor/<short-description>` | `refactor/user-service` |
| Docs | `docs/<short-description>` | `docs/deployment-guide` |

---

## Commit messages

Follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

```
<type>(optional scope): <short description>

[optional body]
```

**Types:** `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `ci`

Examples:
```
feat(users): add email field to user model
fix(jwt): handle expired token edge case
docs: add deployment guide
test(users): add integration tests for DELETE endpoint
```

---

## Adding a new module / resource

Follow the step-by-step guide in [docs/add-new-module.md](../docs/add-new-module.md).

---

## Code standards

- **TypeScript strict mode** is enabled — no implicit `any`
- Every public method in services and repositories must have a corresponding unit test
- Coverage thresholds are enforced by Jest (see `jest.config.js`)
- Run `npm run lint` before pushing — CI will fail on lint errors
- Run `npm run build` to catch TypeScript errors

---

## Pull request process

1. Create a branch from `master`
2. Implement your changes with tests
3. Ensure `npm test`, `npm run lint`, and `npm run build` all pass locally
4. Open a PR and fill in the PR template
5. At least one maintainer review is required before merging

---

## Running tests

```bash
# All tests (unit + integration) with coverage
npm test

# Watch mode
npm run test:watch

# Verbose local report (HTML + text)
npm run test:local
```

See [docs/testing.md](../docs/testing.md) for more details.
