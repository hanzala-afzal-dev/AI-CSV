import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/check-env.ts"], {
  stdio: "inherit",
  env: process.env
});

process.exit(result.status ?? 1);
