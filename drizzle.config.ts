import { defineConfig } from "drizzle-kit";
import { loadEnvFile } from "node:process";

try {
  loadEnvFile(".env");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

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
