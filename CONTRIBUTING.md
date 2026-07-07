# Contributing

## Workflow

1. Read the active specification in `specs/`.
2. Keep changes inside the defined architecture boundary.
3. Add or update tests for domain rules, contracts, and pure infrastructure logic.
4. Run the quality gates before opening a pull request.

## Commands

```bash
corepack enable
pnpm install
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Architecture Boundary

Domain must not import infrastructure packages. Application code depends on domain and
ports. Infrastructure implements ports. Web and worker compose concrete dependencies.
