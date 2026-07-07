import { NextResponse } from "next/server";
import { loadEnv } from "@agentic-csv/infrastructure/config";
import { createPgPool } from "@agentic-csv/infrastructure/database";
import {
  checkPostgres,
  checkQdrant,
  checkRedis,
  checkS3,
  createReadinessReport
} from "@agentic-csv/infrastructure/health";
import { createRedisClient } from "@agentic-csv/infrastructure/redis";
import { createS3Client } from "@agentic-csv/infrastructure/storage";

export async function GET() {
  const env = loadEnv();
  const pool = createPgPool(env);
  const redis = createRedisClient(env);
  const s3 = createS3Client(env);

  try {
    const report = await createReadinessReport([
      () => checkPostgres(pool),
      () => checkRedis(redis),
      () => checkQdrant(env),
      () => checkS3(s3, env.S3_BUCKET)
    ]);

    return NextResponse.json(report, { status: report.ok ? 200 : 503 });
  } finally {
    await pool.end();
    if (redis.isOpen) {
      await redis.quit();
    }
  }
}
