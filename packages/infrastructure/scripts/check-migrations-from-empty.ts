import { spawn } from "node:child_process";
import { Client } from "pg";

const migrationUrl = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!migrationUrl) {
  throw new Error("MIGRATION_DATABASE_URL or DATABASE_URL is required.");
}
const parsed = new URL(migrationUrl);
if (!["postgres:", "postgresql:"].includes(parsed.protocol)) {
  throw new Error("Migration database URL must use PostgreSQL.");
}
const databaseName = `agentic_csv_migration_check_${process.pid}`;
if (!/^[a-z0-9_]+$/.test(databaseName)) {
  throw new Error("Generated migration database name is invalid.");
}
const quotedDatabaseName = `"${databaseName}"`;
const targetUrl = new URL(parsed);
targetUrl.pathname = `/${databaseName}`;
const admin = new Client({ connectionString: migrationUrl });

try {
  await admin.connect();
  await admin.query(`create database ${quotedDatabaseName}`);
  try {
    await runMigration(targetUrl.toString());
    const target = new Client({ connectionString: targetUrl.toString() });
    try {
      await target.connect();
      const result = await target.query<{ count: string }>(
        "select count(*)::text as count from drizzle.__drizzle_migrations"
      );
      const count = Number(result.rows[0]?.count ?? 0);
      if (!Number.isInteger(count) || count < 1) {
        throw new Error("No migrations were recorded in the empty database.");
      }
      console.log(`Migration-from-empty check passed ${count} migrations.`);
    } finally {
      await target.end();
    }
  } finally {
    await admin.query(
      "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
      [databaseName]
    );
    await admin.query(`drop database if exists ${quotedDatabaseName}`);
  }
} finally {
  await admin.end();
}

async function runMigration(databaseUrl: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn("pnpm", ["exec", "drizzle-kit", "migrate"], {
      cwd: process.cwd(),
      env: { ...process.env, MIGRATION_DATABASE_URL: databaseUrl },
      stdio: "inherit"
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          signal
            ? `Migration process exited after signal ${signal}.`
            : `Migration process exited with code ${String(code)}.`
        )
      );
    });
  });
}
