# Contributing

## Workflow

1. Read `docs/implementation.md` and the active specification in `docs/specs/`.
2. Keep changes inside the defined architecture boundary.
3. Add or update tests for domain rules, contracts, and pure infrastructure logic.
4. Run the quality gates before opening a pull request.

## Commands

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm release:check
```

See `docs/phase-9-release.md` for the gate contents and optional provider smoke test.

## Architecture Boundary

Domain must not import infrastructure packages. Application code depends on domain and
ports. Infrastructure implements ports. Web and worker compose concrete dependencies.
