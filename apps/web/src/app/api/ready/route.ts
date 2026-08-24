import { NextResponse } from "next/server";
import type { ReadinessReport } from "@agentic-csv/infrastructure/health";
import { getRuntimeReadinessReport } from "@/server/runtime";

const readinessCacheTtlMs = 5_000;
let readinessCache:
  { readonly expiresAt: number; readonly report: Promise<ReadinessReport> } | undefined;

export async function GET() {
  const report = await readCachedReadinessReport();
  return NextResponse.json(report, { status: report.ok ? 200 : 503 });
}

function readCachedReadinessReport(): Promise<ReadinessReport> {
  const now = Date.now();
  if (readinessCache && readinessCache.expiresAt > now) return readinessCache.report;

  const report = Promise.resolve().then(() => getRuntimeReadinessReport());
  readinessCache = { expiresAt: now + readinessCacheTtlMs, report };
  void report.catch(() => {
    if (readinessCache?.report === report) readinessCache = undefined;
  });
  return report;
}
