import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./packages/infrastructure/drizzle/schema.ts",
  out: "./packages/infrastructure/drizzle/migrations",
  dbCredentials: {
    url:
      process.env.MIGRATION_DATABASE_URL ??
      process.env.DATABASE_URL ??
      "postgres://agentic_csv:agentic_csv_password@localhost:5432/agentic_csv"
  }
});
