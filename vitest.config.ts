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
