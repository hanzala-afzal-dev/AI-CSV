# Local Docker workflow

The root `.env` file is the source of truth for Compose interpolation and application configuration.
The `docker/.env` file contains only container-specific overrides such as internal service hostnames.

Create the ignored local files once:

```bash
cp .env.example .env
cp docker/.env.example docker/.env
cp docker/docker-compose.yml.example docker/stack.yml
pnpm env:check
```

Run normal lifecycle commands from the repository root:

```bash
pnpm docker:config
pnpm docker:up
pnpm docker:ps
pnpm docker:logs
pnpm docker:stop
pnpm docker:start
pnpm docker:down
```

The local `web` and `worker` services use Docker development targets. Application and shared-package
source directories are bind-mounted read-only, while Next.js, `tsx`, and `tsup` watch inside the existing
containers. Edit source normally; Next.js hot reloads frontend/server changes and package watch builds
refresh shared package output without rebuilding or replacing a container.

Use `pnpm docker:up:build` once after initial checkout and whenever a dependency or container definition
changes. For normal daily startup use `pnpm docker:up`, which creates missing containers and starts
existing services without rebuilding images. These changes require a rebuild:

- `package.json`, `pnpm-lock.yaml`, or workspace configuration;
- a Dockerfile, Compose service, mounted path, or base image;
- native/system dependencies used by an application image.

When the tracked Compose template changes, merge it into the ignored `docker/stack.yml` before rebuilding.
Do not recopy the template for ordinary application changes.

Changes under `apps/*/src`, `apps/web/public`, `packages/*/src`, and the Drizzle source directory do not
require a rebuild. Run `pnpm build` on the host for the normal production compile check. The standalone
production container targets remain available when release-image verification is needed:

```bash
pnpm docker:build:web:production
pnpm docker:build:worker:production
```

`pnpm docker:reset` deletes local volumes and data and must only be used intentionally.

`pnpm docker:start` only starts containers that already exist after `pnpm docker:stop`. It cannot create
a missing `redis`, `postgres`, or application container. After `pnpm docker:down`, use `pnpm docker:up`,
not `start`.

Direct commands from `docker/` use the auto-discovered `compose.yaml`, which loads the root `.env` before
interpolating `stack.yml`. The wrapper pins the Compose project name to `agentic-csv-analyst`, preventing
lifecycle commands from selecting containers belonging to another repository:

```bash
docker compose config --quiet
docker compose up -d
docker compose stop
docker compose start
docker compose down
```

The ignored `docker/.env` contains container-only application overrides. It deliberately does not
duplicate database passwords, S3 credentials, or application ports from the root `.env`.

An infrastructure-only workflow is also supported. Stop the Compose `web` and `worker` services to free
the application port, run `pnpm infra:up`, then run `pnpm dev` on the host. The root development command
loads `.env` and starts workspace watchers; it is not the default fully containerized workflow.
