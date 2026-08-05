import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { DuckDBInstance } from "@duckdb/node-api";
import {
  AnalysisError,
  type AnalysisEngine,
  type AnalysisExecutionResult,
  type ReadyAnalysisContext
} from "@agentic-csv/application";
import {
  analysisResultRowSchema,
  type AnalysisPlanContract,
  type AnalysisResultRowContract,
  type ResultColumnContract
} from "@agentic-csv/contracts";
import { DuckDbAnalysisCompiler } from "./duckdb-analysis-compiler";

export interface DuckDbAnalysisEngineOptions {
  readonly maxScanBytes: number;
  readonly maxResultRows: number;
  readonly maxResultBytes: number;
  readonly timeoutMs: number;
  readonly memoryLimitMb: number;
  readonly threads: number;
}

export class DuckDbAnalysisEngine implements AnalysisEngine {
  private readonly compiler: DuckDbAnalysisCompiler;

  public constructor(private readonly options: DuckDbAnalysisEngineOptions) {
    validateOptions(options);
    this.compiler = new DuckDbAnalysisCompiler(options.maxResultRows);
  }

  public async execute(input: {
    readonly context: ReadyAnalysisContext;
    readonly plan: AnalysisPlanContract;
    readonly content: AsyncIterable<Uint8Array>;
  }): Promise<AnalysisExecutionResult> {
    if (input.context.sizeBytes > this.options.maxScanBytes) {
      throw new AnalysisError(
        "ANALYSIS_SCAN_LIMIT_EXCEEDED",
        "The dataset exceeds the configured analysis scan limit."
      );
    }
    const workspace = await mkdtemp(join(tmpdir(), "agentic-csv-analysis-"));
    const path = join(workspace, "dataset.csv");
    try {
      await writeVerifiedSource(
        input.context,
        input.content,
        path,
        this.options.maxScanBytes
      );
      return await this.executeFile(path, input.context, input.plan);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }

  private async executeFile(
    path: string,
    context: ReadyAnalysisContext,
    plan: AnalysisPlanContract
  ): Promise<AnalysisExecutionResult> {
    const compiled = this.compiler.compile({ plan, columns: context.columns });
    const instance = await DuckDBInstance.create(":memory:", {
      threads: String(this.options.threads),
      memory_limit: `${this.options.memoryLimitMb}MB`,
      preserve_insertion_order: "false",
      autoinstall_known_extensions: "false",
      autoload_known_extensions: "false"
    });
    const connection = await instance.connect();
    let timedOut = false;
    const started = performance.now();
    const timeout = setTimeout(() => {
      timedOut = true;
      connection.interrupt();
    }, this.options.timeoutMs);
    try {
      const names = context.columns
        .map((column) => sqlString(column.canonicalName))
        .join(", ");
      await connection.run(
        `create table dataset as
         select * from read_csv(
           $path,
           header = true,
           auto_detect = true,
           delim = ${sqlString(context.delimiter)},
           names = [${names}],
           strict_mode = true,
           sample_size = 20480
         )`,
        { path }
      );
      await connection.run("set enable_external_access = false");
      const reader = await connection.runAndReadAll(compiled.sql, compiled.parameters);
      const converted = reader
        .getRowObjectsJS()
        .map((row) => convertRow(row, compiled.schema));
      const rowLimited = converted.length > compiled.rowLimit;
      const candidates = converted.slice(0, compiled.rowLimit);
      const bounded = boundResultBytes(candidates, this.options.maxResultBytes);
      const rows = bounded.rows;
      const truncated = rowLimited || bounded.truncated;
      const payload = JSON.stringify({ schema: compiled.schema, rows });
      return {
        planHash: sha256Hex(stableJson(plan)),
        schema: [...compiled.schema],
        rows,
        rowCount: rows.length,
        truncated,
        executionMs: Math.max(0, Math.round(performance.now() - started)),
        checksum: sha256Hex(payload),
        warnings: truncated ? ["The result exceeded a configured row or byte limit."] : []
      };
    } catch (error) {
      if (error instanceof AnalysisError) throw error;
      if (timedOut) {
        throw new AnalysisError(
          "ANALYSIS_TIMEOUT",
          "The analysis timed out. Try a narrower question."
        );
      }
      throw new AnalysisError(
        "ANALYSIS_EXECUTION_FAILED",
        "The dataset could not be analyzed safely."
      );
    } finally {
      clearTimeout(timeout);
      connection.closeSync();
      instance.closeSync();
    }
  }
}

async function writeVerifiedSource(
  context: ReadyAnalysisContext,
  content: AsyncIterable<Uint8Array>,
  path: string,
  maxScanBytes: number
): Promise<void> {
  const hash = createHash("sha256");
  let written = 0;
  const limiter = new Transform({
    transform: (chunk: Buffer | Uint8Array, _encoding, callback) => {
      const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      written += value.byteLength;
      if (written > context.sizeBytes || written > maxScanBytes) {
        callback(
          new AnalysisError(
            "ANALYSIS_SCAN_LIMIT_EXCEEDED",
            "The dataset exceeds the configured analysis scan limit."
          )
        );
        return;
      }
      hash.update(value);
      callback(null, value);
    }
  });
  await pipeline(
    Readable.from(content),
    limiter,
    createWriteStream(path, { flags: "wx", mode: 0o600 })
  );
  if (written !== context.sizeBytes || hash.digest("base64") !== context.checksumSha256) {
    throw new AnalysisError(
      "ANALYSIS_SOURCE_CHANGED",
      "The stored dataset no longer matches its immutable version metadata."
    );
  }
}

function convertRow(
  row: Readonly<Record<string, unknown>>,
  schema: readonly ResultColumnContract[]
): AnalysisResultRowContract {
  const result: Record<string, string | number | boolean | null> = {};
  for (const column of schema) {
    result[column.field] = jsonValue(row[column.field]);
  }
  return analysisResultRowSchema.parse(result);
}

function jsonValue(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean" || typeof value === "string") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value;
  }
  if (typeof value === "bigint") {
    const number = Number(value);
    return Number.isSafeInteger(number) ? number : value.toString();
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "toString" in value) return String(value);
  return String(value);
}

function boundResultBytes(
  rows: readonly AnalysisResultRowContract[],
  maxBytes: number
): { readonly rows: AnalysisResultRowContract[]; readonly truncated: boolean } {
  const accepted: AnalysisResultRowContract[] = [];
  for (const row of rows) {
    const candidate = [...accepted, row];
    if (Buffer.byteLength(JSON.stringify(candidate), "utf8") > maxBytes) {
      if (accepted.length === 0) {
        throw new AnalysisError(
          "ANALYSIS_RESULT_LIMIT_EXCEEDED",
          "One result row exceeds the configured response limit."
        );
      }
      return { rows: accepted, truncated: true };
    }
    accepted.push(row);
  }
  return { rows: accepted, truncated: false };
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function validateOptions(options: DuckDbAnalysisEngineOptions): void {
  if (
    !Number.isInteger(options.maxScanBytes) ||
    options.maxScanBytes < 1 ||
    !Number.isInteger(options.maxResultRows) ||
    options.maxResultRows < 1 ||
    options.maxResultRows > 500 ||
    !Number.isInteger(options.maxResultBytes) ||
    options.maxResultBytes < 1_024 ||
    options.maxResultBytes > 2_097_152 ||
    !Number.isInteger(options.timeoutMs) ||
    options.timeoutMs < 100 ||
    !Number.isInteger(options.memoryLimitMb) ||
    options.memoryLimitMb < 64 ||
    !Number.isInteger(options.threads) ||
    options.threads < 1 ||
    options.threads > 4
  ) {
    throw new Error("Invalid DuckDB analysis options.");
  }
}
