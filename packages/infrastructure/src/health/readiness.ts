import { HeadBucketCommand } from "@aws-sdk/client-s3";
import type { S3Client } from "@aws-sdk/client-s3";
import type { Pool } from "pg";
import type { AppEnv } from "../config/env";
import type { RedisClient } from "../redis/client";
import { isQdrantReady } from "../vector/qdrant";

export type DependencyName = "postgres" | "redis" | "qdrant" | "s3";

export interface DependencyStatus {
  readonly name: DependencyName;
  readonly ok: boolean;
  readonly message: string;
}

export interface ReadinessReport {
  readonly ok: boolean;
  readonly checkedAt: string;
  readonly dependencies: readonly DependencyStatus[];
}

export async function checkPostgres(pool: Pool): Promise<DependencyStatus> {
  try {
    await pool.query("select 1");
    return { name: "postgres", ok: true, message: "reachable" };
  } catch {
    return { name: "postgres", ok: false, message: "unreachable" };
  }
}

export async function checkRedis(redis: RedisClient): Promise<DependencyStatus> {
  try {
    if (!redis.isOpen) {
      await redis.connect();
    }
    await redis.ping();
    return { name: "redis", ok: true, message: "reachable" };
  } catch {
    return { name: "redis", ok: false, message: "unreachable" };
  }
}

export async function checkQdrant(
  env: Pick<AppEnv, "QDRANT_URL" | "QDRANT_API_KEY">
): Promise<DependencyStatus> {
  try {
    const ok = await isQdrantReady(env);
    return { name: "qdrant", ok, message: ok ? "reachable" : "unhealthy response" };
  } catch {
    return { name: "qdrant", ok: false, message: "unreachable" };
  }
}

export async function checkS3(
  client: S3Client,
  bucket: string
): Promise<DependencyStatus> {
  try {
    await client.send(new HeadBucketCommand({ Bucket: bucket }));
    return { name: "s3", ok: true, message: "bucket reachable" };
  } catch {
    return { name: "s3", ok: false, message: "bucket unreachable" };
  }
}

export async function createReadinessReport(
  checks: readonly (() => Promise<DependencyStatus>)[]
): Promise<ReadinessReport> {
  const dependencies = await Promise.all(checks.map((check) => check()));
  return {
    ok: dependencies.every((dependency) => dependency.ok),
    checkedAt: new Date().toISOString(),
    dependencies
  };
}
