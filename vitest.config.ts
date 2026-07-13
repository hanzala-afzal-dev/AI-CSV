import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts", "packages/*/src/**/*.ts"]
    }
  },
  resolve: {
    alias: {
      "@": new URL("./apps/web/src", import.meta.url).pathname,
      "@agentic-csv/infrastructure/auth": new URL(
        "./packages/infrastructure/src/auth/api-key.ts",
        import.meta.url
      ).pathname,
      "@agentic-csv/infrastructure/config": new URL(
        "./packages/infrastructure/src/config/env.ts",
        import.meta.url
      ).pathname,
      "@agentic-csv/infrastructure/database": new URL(
        "./packages/infrastructure/src/database/client.ts",
        import.meta.url
      ).pathname,
      "@agentic-csv/infrastructure/logging": new URL(
        "./packages/infrastructure/src/logging/logger.ts",
        import.meta.url
      ).pathname,
      "@agentic-csv/infrastructure/identity": new URL(
        "./packages/infrastructure/src/auth/index.ts",
        import.meta.url
      ).pathname,
      "@agentic-csv/infrastructure/rate-limit": new URL(
        "./packages/infrastructure/src/rate-limit/rate-limiter.ts",
        import.meta.url
      ).pathname,
      "@agentic-csv/infrastructure/redis": new URL(
        "./packages/infrastructure/src/redis/client.ts",
        import.meta.url
      ).pathname,
      "@agentic-csv/infrastructure/storage": new URL(
        "./packages/infrastructure/src/storage/s3-object-storage.ts",
        import.meta.url
      ).pathname,
      "@agentic-csv/infrastructure/unit-of-work": new URL(
        "./packages/infrastructure/src/database/unit-of-work.ts",
        import.meta.url
      ).pathname,
      "@agentic-csv/domain": new URL("./packages/domain/src/index.ts", import.meta.url)
        .pathname,
      "@agentic-csv/application": new URL(
        "./packages/application/src/index.ts",
        import.meta.url
      ).pathname,
      "@agentic-csv/contracts": new URL(
        "./packages/contracts/src/index.ts",
        import.meta.url
      ).pathname,
      "@agentic-csv/infrastructure": new URL(
        "./packages/infrastructure/src/index.ts",
        import.meta.url
      ).pathname,
      "@agentic-csv/agent": new URL("./packages/agent/src/index.ts", import.meta.url)
        .pathname
    }
  }
});
