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

## Phase 3 environment upgrade

The OpenAI settings feature does not use a shared `OPENAI_API_KEY`. Each user enters a key in the
authenticated settings screen, and the server encrypts it before persistence. When upgrading an existing
checkout, merge the following keys from `.env.example` into the root `.env` without replacing your existing
database or service passwords:

```dotenv
# Generate once with: openssl rand -base64 32
APP_ENCRYPTION_KEY=<base64-encoded-32-byte-key>
APP_ENCRYPTION_KEY_VERSION=v1
APP_ENCRYPTION_PREVIOUS_KEYS=
OPENAI_API_BASE_URL=https://api.openai.com/v1
OPENAI_VALIDATION_TIMEOUT_MS=5000
DEFAULT_OPENAI_MODEL=gpt-5.5
DEFAULT_REASONING_EFFORT=medium
RATE_LIMIT_CREDENTIAL_VALIDATION_MAX_REQUESTS=5
```

Generate the encryption key locally, place only its output in `APP_ENCRYPTION_KEY`, and validate the file:

```bash
openssl rand -base64 32
pnpm env:check
pnpm docker:config
pnpm docker:up
pnpm docker:ps
```

Run `pnpm docker:up` once after changing environment values because `docker:start` does not update an
existing container's environment. This reconciles the affected containers without rebuilding their images;
the Compose `migrate` service applies committed migrations before `web` and `worker` start. After that,
return to `pnpm docker:stop` and `pnpm docker:start` for normal daily use. Host-run development can apply
the same migration explicitly with `pnpm db:migrate` after PostgreSQL is running.

Treat `APP_ENCRYPTION_KEY` as persistent secret material. Do not casually regenerate it after credentials
have been stored, or those credentials will no longer decrypt. Intentional key rotation must use a new
`APP_ENCRYPTION_KEY_VERSION` and retain the old version and key in `APP_ENCRYPTION_PREVIOUS_KEYS` until all
stored credentials have been re-encrypted.

## Phase 4 environment upgrade

Existing checkouts must also merge the conversation protection defaults from `.env.example` into the
root `.env`:

```dotenv
RATE_LIMIT_CHAT_SUBMISSION_MAX_REQUESTS=20
RATE_LIMIT_SSE_CONNECTION_MAX_REQUESTS=30
SSE_MAX_CONNECTIONS_PER_USER=3
SSE_CONNECTION_LEASE_SECONDS=35
```

Then run `pnpm env:check` and `pnpm docker:up` once so the existing web container receives the new values
and migration `0008` runs. Environment and migration changes do not require an image rebuild. The Phase 4
change itself added a worker workspace dependency, so an existing checkout needs one
`pnpm docker:up:build` for this upgrade only; subsequent source edits and daily starts use the normal
non-rebuild workflow below.

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
containers. The application and infrastructure TypeScript configs are mounted too, so declaration builds
resolve current workspace source instead of stale image output. Edit source normally; Next.js hot reloads
frontend/server changes and package watch builds refresh shared package output without rebuilding or
replacing a container.

Use `pnpm docker:up:build` once after initial checkout and whenever image contents change. For normal
daily use, stop and restart the existing containers with `pnpm docker:stop` and `pnpm docker:start`. Use
`pnpm docker:up` only when containers are missing or Compose configuration must be reconciled. These
changes require an image rebuild:

- `package.json`, `pnpm-lock.yaml`, or workspace configuration;
- a Dockerfile or base image;
- native/system dependencies used by an application image.

Compose-only environment, command, health-check, or bind-mount changes require `pnpm docker:up` to
recreate affected containers, but do not require an image build. When the tracked Compose template
changes, merge it into the ignored `docker/stack.yml` before reconciling. Do not recopy the template for
ordinary application changes.

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
