.PHONY: dev build lint typecheck test test-coverage format format-check env-check infra-up infra-down infra-reset docker-config docker-build docker-up docker-up-build docker-ps docker-logs docker-down docker-reset ci

dev:
	pnpm dev

build:
	pnpm build

lint:
	pnpm lint

typecheck:
	pnpm typecheck

test:
	pnpm test

test-coverage:
	pnpm test:coverage

format:
	pnpm format

format-check:
	pnpm format:check

env-check:
	pnpm env:check

infra-up:
	pnpm infra:up

infra-down:
	pnpm infra:down

infra-reset:
	pnpm infra:reset

docker-config:
	pnpm docker:config

docker-build:
	pnpm docker:build

docker-up:
	pnpm docker:up

docker-up-build:
	pnpm docker:up:build

docker-ps:
	pnpm docker:ps

docker-logs:
	pnpm docker:logs

docker-down:
	pnpm docker:down

docker-reset:
	pnpm docker:reset

ci:
	pnpm ci
