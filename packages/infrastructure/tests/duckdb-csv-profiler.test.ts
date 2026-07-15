import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DatasetFileValidationError } from "@agentic-csv/application";
import { DuckDbCsvProfiler } from "../src/analytics";

const profiler = new DuckDbCsvProfiler({
  maxBytes: 1024 * 1024,
  maxRows: 100,
  maxColumns: 20,
  maxFieldCharacters: 1000,
  maxMalformedRowRatio: 0,
  timeoutMs: 10_000,
  memoryLimitMb: 128
});

describe("DuckDbCsvProfiler", () => {
  it("validates and profiles a semicolon-delimited UTF-8 CSV", async () => {
    const csv = [
      "order_id;amount;country;ordered_at;note",
      '1;10.5;DE;2026-01-01;"First order"',
      '2;20;FR;2026-01-02;"=2+2"',
      "3;;DE;2026-01-03;"
    ].join("\n");

    const profile = await profiler.profile(input(csv));

    expect(profile).toMatchObject({
      version: 1,
      rowCount: 3,
      columnCount: 5,
      encoding: "utf-8",
      delimiter: ";"
    });
    expect(
      profile.columns.find((column) => column.originalName === "amount")
    ).toMatchObject({
      inferredType: "decimal",
      semanticType: "numeric",
      statistics: { nullCount: 1, mean: 15.25 }
    });
    expect(
      profile.columns.find((column) => column.originalName === "order_id")
    ).toMatchObject({ semanticType: "identifier" });
    expect(
      profile.columns.find((column) => column.originalName === "note")?.statistics
        .exampleValues
    ).toContain("=2+2");
    expect(profile.suggestedPrompts.length).toBeGreaterThanOrEqual(3);
    expect(profile.suggestedPrompts.length).toBeLessThanOrEqual(6);
  });

  it("rejects binary content even when it has a CSV filename", async () => {
    const binary = Buffer.from([0, 1, 2, 3, 4]);

    await expect(profiler.profile(input(binary))).rejects.toMatchObject({
      code: "DATASET_INVALID_FILE"
    });
  });

  it("rejects malformed rows and configured row-limit violations", async () => {
    await expect(profiler.profile(input("a,b\n1,2\n3"))).rejects.toMatchObject({
      code: "DATASET_MALFORMED_CSV"
    });

    const limited = new DuckDbCsvProfiler({
      maxBytes: 1024,
      maxRows: 1,
      maxColumns: 10,
      maxFieldCharacters: 100,
      maxMalformedRowRatio: 0,
      timeoutMs: 10_000,
      memoryLimitMb: 128
    });
    await expect(limited.profile(input("a,b\n1,2\n3,4"))).rejects.toMatchObject({
      code: "DATASET_ROW_LIMIT_EXCEEDED"
    });
  });

  it("bounds field accumulation for every row, not only the header", async () => {
    const columnLimited = new DuckDbCsvProfiler({
      maxBytes: 1024,
      maxRows: 10,
      maxColumns: 2,
      maxFieldCharacters: 100,
      maxMalformedRowRatio: 0,
      timeoutMs: 10_000,
      memoryLimitMb: 128
    });

    await expect(columnLimited.profile(input("a,b\n1,2,3"))).rejects.toMatchObject({
      code: "DATASET_COLUMN_LIMIT_EXCEEDED"
    });
  });

  it("fails integrity verification before DuckDB reads the file", async () => {
    await expect(
      profiler.profile({
        ...input("a,b\n1,2"),
        expectedChecksumSha256: "A".repeat(43) + "="
      })
    ).rejects.toBeInstanceOf(DatasetFileValidationError);
  });

  it("treats SQL-shaped headers as quoted identifiers, never executable SQL", async () => {
    const hostileHeader = 'amount"); drop table dataset; --';
    const profile = await profiler.profile(
      input('"amount""); drop table dataset; --",category\n10,A\n20,B')
    );

    expect(profile.rowCount).toBe(2);
    expect(profile.columns.map((column) => column.originalName)).toEqual([
      hostileHeader,
      "category"
    ]);
    expect(profile.columns[0]?.statistics.mean).toBe(15);
  });

  it("profiles small files with production-sized upload and memory limits", async () => {
    const productionSized = new DuckDbCsvProfiler({
      maxBytes: 100 * 1024 * 1024,
      maxRows: 1_000_000,
      maxColumns: 500,
      maxFieldCharacters: 1_000_000,
      maxMalformedRowRatio: 0,
      timeoutMs: 60_000,
      memoryLimitMb: 512
    });

    await expect(
      productionSized.profile(input("id,amount\n1,10\n2,20"))
    ).resolves.toMatchObject({ rowCount: 2, columnCount: 2 });
  });
});

function input(value: string | Buffer) {
  const body = Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8");
  return {
    content: (async function* () {
      yield body;
    })(),
    originalFilename: "sales.csv",
    declaredSizeBytes: body.byteLength,
    expectedChecksumSha256: createHash("sha256").update(body).digest("base64")
  };
}
