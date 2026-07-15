import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api";
import {
  DatasetFileValidationError,
  type CsvProfileInput,
  type CsvProfiler
} from "@agentic-csv/application";
import {
  datasetColumnProfileSchema,
  datasetProfileSchema,
  type DatasetColumnProfileContract,
  type DatasetProfileContract,
  type DatasetProfileWarningContract
} from "@agentic-csv/contracts";

export interface DuckDbCsvProfilerOptions {
  readonly maxBytes: number;
  readonly maxRows: number;
  readonly maxColumns: number;
  readonly maxFieldCharacters: number;
  readonly maxMalformedRowRatio: number;
  readonly timeoutMs: number;
  readonly memoryLimitMb: number;
}

interface CsvScanResult {
  readonly delimiter: "," | ";" | "\t" | "|";
  readonly originalHeaders: readonly string[];
  readonly malformedRows: number;
  readonly warnings: readonly DatasetProfileWarningContract[];
}

interface DescribedColumn {
  readonly name: string;
  readonly duckDbType: string;
}

const sampleBytes = 64 * 1024;

export class DuckDbCsvProfiler implements CsvProfiler {
  public constructor(private readonly options: DuckDbCsvProfilerOptions) {
    validateOptions(options);
  }

  public async profile(input: CsvProfileInput): Promise<DatasetProfileContract> {
    if (!input.originalFilename.toLowerCase().endsWith(".csv")) {
      throw invalid("DATASET_INVALID_FILE", "Only CSV files can be profiled.");
    }

    const workspace = await mkdtemp(join(tmpdir(), "agentic-csv-profile-"));
    const csvPath = join(workspace, "original.csv");
    try {
      await this.writeVerifiedFile(input, csvPath);
      const scan = await scanCsv(csvPath, this.options);
      return await this.profileWithDuckDb(csvPath, scan);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }

  private async writeVerifiedFile(input: CsvProfileInput, path: string): Promise<void> {
    if (input.declaredSizeBytes < 1 || input.declaredSizeBytes > this.options.maxBytes) {
      throw invalid("DATASET_INVALID_FILE", "CSV file size is invalid.");
    }
    const hash = createHash("sha256");
    let written = 0;
    const limiter = new Transform({
      transform: (chunk: Buffer | Uint8Array, _encoding, callback) => {
        const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        written += value.byteLength;
        if (written > input.declaredSizeBytes || written > this.options.maxBytes) {
          callback(
            invalid("DATASET_INVALID_FILE", "CSV file exceeds its declared size.")
          );
          return;
        }
        hash.update(value);
        callback(null, value);
      }
    });
    await pipeline(
      Readable.from(input.content),
      limiter,
      createWriteStream(path, { flags: "wx", mode: 0o600 })
    );
    if (written !== input.declaredSizeBytes) {
      throw invalid("DATASET_INVALID_FILE", "CSV file size changed after upload.");
    }
    if (hash.digest("base64") !== input.expectedChecksumSha256) {
      throw invalid("DATASET_CHECKSUM_MISMATCH", "CSV checksum verification failed.");
    }
  }

  private async profileWithDuckDb(
    path: string,
    scan: CsvScanResult
  ): Promise<DatasetProfileContract> {
    const instance = await DuckDBInstance.create(":memory:", {
      threads: "1",
      memory_limit: `${this.options.memoryLimitMb}MB`,
      preserve_insertion_order: "false"
    });
    const connection = await instance.connect();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      connection.interrupt();
    }, this.options.timeoutMs);
    try {
      const ignoreErrors = scan.malformedRows > 0 ? "true" : "false";
      const maxLineSize = duckDbMaxLineSize(this.options);
      await connection.run(
        `create table dataset as
         select * from read_csv(
           $path,
           header = true,
           auto_detect = true,
           delim = ${sqlString(scan.delimiter)},
           strict_mode = true,
           ignore_errors = ${ignoreErrors},
           sample_size = 20480,
           max_line_size = ${maxLineSize}
         )
         limit ${this.options.maxRows + 1}`,
        { path }
      );
      const rowCount = await readCount(connection);
      if (rowCount > this.options.maxRows) {
        throw invalid(
          "DATASET_ROW_LIMIT_EXCEEDED",
          "CSV contains more rows than the configured limit."
        );
      }
      const described = await describeColumns(connection);
      if (described.length < 1) {
        throw invalid("DATASET_EMPTY_FILE", "CSV does not contain a header row.");
      }
      if (described.length > this.options.maxColumns) {
        throw invalid(
          "DATASET_COLUMN_LIMIT_EXCEEDED",
          "CSV contains more columns than the configured limit."
        );
      }
      if (described.length !== scan.originalHeaders.length) {
        throw invalid(
          "DATASET_MALFORMED_CSV",
          "CSV header could not be parsed consistently."
        );
      }

      const canonicalNames = createCanonicalNames(scan.originalHeaders);
      const columns: DatasetColumnProfileContract[] = [];
      for (const [ordinal, column] of described.entries()) {
        const originalName = scan.originalHeaders[ordinal];
        const canonicalName = canonicalNames[ordinal];
        if (!originalName || !canonicalName) {
          throw invalid("DATASET_MALFORMED_CSV", "CSV header is incomplete.");
        }
        columns.push(
          await profileColumn(
            connection,
            column,
            ordinal,
            originalName,
            canonicalName,
            rowCount
          )
        );
      }

      const generatedAt = new Date().toISOString();
      return datasetProfileSchema.parse({
        version: 1,
        rowCount,
        columnCount: columns.length,
        encoding: "utf-8",
        delimiter: scan.delimiter,
        columns,
        warnings: scan.warnings,
        suggestedPrompts: createSuggestedPrompts(columns),
        generatedAt
      });
    } catch (error) {
      if (error instanceof DatasetFileValidationError) throw error;
      if (timedOut) {
        throw invalid(
          "DATASET_PROFILE_TIMEOUT",
          "CSV profiling exceeded the configured time limit."
        );
      }
      throw invalid("DATASET_MALFORMED_CSV", "CSV could not be parsed safely.");
    } finally {
      clearTimeout(timeout);
      connection.closeSync();
      instance.closeSync();
    }
  }
}

async function scanCsv(
  path: string,
  options: DuckDbCsvProfilerOptions
): Promise<CsvScanResult> {
  const file = await open(path, "r");
  try {
    const sample = Buffer.alloc(sampleBytes);
    const { bytesRead } = await file.read(sample, 0, sample.length, 0);
    if (bytesRead === 0) throw invalid("DATASET_EMPTY_FILE", "CSV file is empty.");
    const head = sample.subarray(0, bytesRead);
    assertTextSignature(head);
    const text = decodeUtf8(head);
    const delimiter = detectDelimiter(text);
    return await scanCsvStructure(path, delimiter, options);
  } finally {
    await file.close();
  }
}

function assertTextSignature(value: Uint8Array): void {
  if (
    (value[0] === 0xff && value[1] === 0xfe) ||
    (value[0] === 0xfe && value[1] === 0xff)
  ) {
    throw invalid(
      "DATASET_ENCODING_UNSUPPORTED",
      "CSV encoding is unsupported. Save the file as UTF-8."
    );
  }
  if (value.includes(0)) {
    throw invalid("DATASET_INVALID_FILE", "CSV contains binary data.");
  }
}

function decodeUtf8(value: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(value, { stream: true });
  } catch {
    throw invalid(
      "DATASET_ENCODING_UNSUPPORTED",
      "CSV encoding is unsupported. Save the file as UTF-8."
    );
  }
}

function detectDelimiter(value: string): "," | ";" | "\t" | "|" {
  const candidates = [",", ";", "\t", "|"] as const;
  let best: { delimiter: (typeof candidates)[number]; score: number } = {
    delimiter: ",",
    score: -1
  };
  for (const delimiter of candidates) {
    const widths = sampleRowWidths(value, delimiter).filter((width) => width > 0);
    if (widths.length === 0) continue;
    const frequency = new Map<number, number>();
    for (const width of widths) frequency.set(width, (frequency.get(width) ?? 0) + 1);
    const [mostCommonWidth, matches] = [...frequency.entries()].sort(
      (left, right) => right[1] - left[1] || right[0] - left[0]
    )[0] ?? [0, 0];
    const score = mostCommonWidth > 1 ? matches * mostCommonWidth : 0;
    if (score > best.score) best = { delimiter, score };
  }
  return best.delimiter;
}

function sampleRowWidths(value: string, delimiter: string): number[] {
  const widths: number[] = [];
  let fields = 1;
  let quoted = false;
  for (let index = 0; index < value.length && widths.length < 20; index += 1) {
    const character = value[index];
    if (character === '"') {
      if (quoted && value[index + 1] === '"') index += 1;
      else quoted = !quoted;
    } else if (!quoted && character === delimiter) {
      fields += 1;
    } else if (!quoted && character === "\n") {
      widths.push(fields);
      fields = 1;
    }
  }
  return widths;
}

async function scanCsvStructure(
  path: string,
  delimiter: CsvScanResult["delimiter"],
  options: DuckDbCsvProfilerOptions
): Promise<CsvScanResult> {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let field = "";
  let fieldCharacters = 0;
  let rowBytes = 0;
  let rowFields: string[] = [];
  let rowHasContent = false;
  let quoted = false;
  let quotePending = false;
  let header: string[] | null = null;
  let dataRows = 0;
  let malformedRows = 0;
  let structurallyMalformed = false;
  const maxRowBytes = duckDbMaxLineSize(options);
  const warnings: DatasetProfileWarningContract[] = [];

  const finishField = () => {
    if (rowFields.length >= options.maxColumns) {
      throw invalid(
        "DATASET_COLUMN_LIMIT_EXCEEDED",
        "CSV contains more columns than the configured limit."
      );
    }
    rowFields.push(header === null ? field : "");
    field = "";
    fieldCharacters = 0;
  };
  const finishRow = () => {
    finishField();
    const blank = !rowHasContent && rowFields.length === 1;
    if (!blank) {
      if (header === null) {
        if (rowFields.length > options.maxColumns) {
          throw invalid(
            "DATASET_COLUMN_LIMIT_EXCEEDED",
            "CSV contains more columns than the configured limit."
          );
        }
        header = rowFields.map((value, ordinal) =>
          normalizeHeader(value, ordinal, warnings)
        );
      } else {
        dataRows += 1;
        if (dataRows > options.maxRows) {
          throw invalid(
            "DATASET_ROW_LIMIT_EXCEEDED",
            "CSV contains more rows than the configured limit."
          );
        }
        if (rowFields.length !== header.length || structurallyMalformed) {
          malformedRows += 1;
        }
      }
    }
    rowFields = [];
    rowHasContent = false;
    structurallyMalformed = false;
    rowBytes = 0;
  };
  const append = (character: string) => {
    fieldCharacters += 1;
    if (fieldCharacters > options.maxFieldCharacters) {
      throw invalid(
        "DATASET_FIELD_LIMIT_EXCEEDED",
        "CSV contains a field longer than the configured limit."
      );
    }
    if (header === null) field += character;
    if (character.trim().length > 0) rowHasContent = true;
  };
  const processCharacter = (character: string) => {
    rowBytes += utf8Length(character);
    if (rowBytes > maxRowBytes) {
      throw invalid(
        "DATASET_ROW_WIDTH_LIMIT_EXCEEDED",
        "CSV contains a row wider than the safe processing limit."
      );
    }
    if (isUnsupportedControl(character, delimiter)) {
      throw invalid("DATASET_INVALID_FILE", "CSV contains binary control data.");
    }
    if (quoted) {
      if (quotePending) {
        if (character === '"') {
          append('"');
          quotePending = false;
          return;
        }
        quoted = false;
        quotePending = false;
        if (character === delimiter) {
          finishField();
          return;
        }
        if (character === "\n") {
          finishRow();
          return;
        }
        if (character === "\r" || character === " " || character === "\t") {
          return;
        }
        structurallyMalformed = true;
        append(character);
        return;
      }
      if (character === '"') quotePending = true;
      else append(character);
      return;
    }

    if (character === '"' && fieldCharacters === 0) {
      quoted = true;
      rowHasContent = true;
    } else if (character === delimiter) {
      finishField();
      rowHasContent = true;
    } else if (character === "\n") {
      finishRow();
    } else if (character !== "\r") {
      if (character === '"') structurallyMalformed = true;
      append(character);
    }
  };

  for await (const chunk of createReadStream(path)) {
    const text = decodeUtf8Chunk(decoder, chunk, true);
    for (const character of text) {
      processCharacter(character);
    }
  }
  const tail = decodeUtf8Chunk(decoder, undefined, false);
  for (const character of tail) processCharacter(character);

  if (quoted && !quotePending) {
    throw invalid("DATASET_MALFORMED_CSV", "CSV contains an unterminated quoted field.");
  }
  if (rowFields.length > 0 || fieldCharacters > 0 || rowHasContent) finishRow();
  if (!header) throw invalid("DATASET_EMPTY_FILE", "CSV does not contain a header row.");
  const ratio = dataRows === 0 ? 0 : malformedRows / dataRows;
  if (ratio > options.maxMalformedRowRatio) {
    throw invalid("DATASET_MALFORMED_CSV", "CSV contains too many malformed rows.");
  }
  if (malformedRows > 0) {
    warnings.push({
      code: "MALFORMED_ROWS_SKIPPED",
      message: `${malformedRows} malformed ${malformedRows === 1 ? "row was" : "rows were"} skipped.`
    });
  }
  return { delimiter, originalHeaders: header, malformedRows, warnings };
}

function decodeUtf8Chunk(
  decoder: TextDecoder,
  value: Uint8Array | undefined,
  stream: boolean
): string {
  try {
    return value === undefined ? decoder.decode() : decoder.decode(value, { stream });
  } catch {
    throw invalid(
      "DATASET_ENCODING_UNSUPPORTED",
      "CSV encoding is unsupported. Save the file as UTF-8."
    );
  }
}

function normalizeHeader(
  value: string,
  ordinal: number,
  warnings: DatasetProfileWarningContract[]
): string {
  const normalized = value.normalize("NFKC").trim();
  if (normalized.length > 500) {
    throw invalid(
      "DATASET_FIELD_LIMIT_EXCEEDED",
      "CSV contains a header longer than the supported limit."
    );
  }
  if (normalized) return normalized;
  warnings.push({
    code: "EMPTY_HEADER_RENAMED",
    message: `Column ${ordinal + 1} had an empty header and was assigned a safe name.`
  });
  return `column_${ordinal + 1}`;
}

function createCanonicalNames(headers: readonly string[]): string[] {
  const used = new Set<string>();
  return headers.map((header, ordinal) => {
    const base =
      header
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 140) || `column_${ordinal + 1}`;
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate)) {
      candidate = `${base.slice(0, 150 - String(suffix).length)}_${suffix}`;
      suffix += 1;
    }
    used.add(candidate);
    return candidate;
  });
}

async function readCount(connection: DuckDBConnection): Promise<number> {
  const reader = await connection.runAndReadAll(
    "select count(*)::bigint as row_count from dataset"
  );
  return asSafeInteger(reader.getRowObjectsJS()[0]?.row_count);
}

async function describeColumns(connection: DuckDBConnection): Promise<DescribedColumn[]> {
  const reader = await connection.runAndReadAll("describe dataset");
  return reader.getRowObjectsJS().map((row) => ({
    name: String(row.column_name),
    duckDbType: String(row.column_type)
  }));
}

async function profileColumn(
  connection: DuckDBConnection,
  column: DescribedColumn,
  ordinal: number,
  originalName: string,
  canonicalName: string,
  rowCount: number
): Promise<DatasetColumnProfileContract> {
  const identifier = quoteIdentifier(column.name);
  const inferredType = mapDuckDbType(column.duckDbType);
  const numeric = inferredType === "integer" || inferredType === "decimal";
  const reader = await connection.runAndReadAll(
    `select
       count(*) filter (where ${identifier} is null or trim(cast(${identifier} as varchar)) = '')::bigint as null_count,
       approx_count_distinct(${identifier})::bigint as distinct_count,
       cast(min(${identifier}) as varchar) as min_value,
       cast(max(${identifier}) as varchar) as max_value,
       ${numeric ? `avg(cast(${identifier} as double))` : "null::double"} as mean_value,
       ${numeric ? `stddev_pop(cast(${identifier} as double))` : "null::double"} as stddev_value
     from dataset`
  );
  const stats = reader.getRowObjectsJS()[0];
  if (!stats) throw new Error("DuckDB did not return column statistics.");
  const nullCount = asSafeInteger(stats.null_count);
  const distinctCount = asSafeInteger(stats.distinct_count);
  const examplesReader = await connection.runAndReadAll(
    `select cast(${identifier} as varchar) as value
     from dataset
     where ${identifier} is not null and trim(cast(${identifier} as varchar)) <> ''
     group by value
     order by value
     limit 5`
  );
  const exampleValues = examplesReader
    .getRowObjectsJS()
    .map((row) => truncate(String(row.value), 160));

  return datasetColumnProfileSchema.parse({
    ordinal,
    originalName,
    canonicalName,
    inferredType,
    semanticType: inferSemanticType(originalName, inferredType, distinctCount, rowCount),
    nullable: nullCount > 0,
    statistics: {
      version: 1,
      nullCount,
      nullPercentage: rowCount === 0 ? 0 : round((nullCount / rowCount) * 100, 4),
      distinctCount,
      min: nullableString(stats.min_value),
      max: nullableString(stats.max_value),
      mean: nullableFiniteNumber(stats.mean_value),
      standardDeviation: nullableFiniteNumber(stats.stddev_value),
      exampleValues
    }
  });
}

function mapDuckDbType(value: string): DatasetColumnProfileContract["inferredType"] {
  const normalized = value.toUpperCase();
  if (
    /^(TINYINT|SMALLINT|INTEGER|BIGINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT)/.test(
      normalized
    )
  ) {
    return "integer";
  }
  if (/^(DECIMAL|NUMERIC|REAL|FLOAT|DOUBLE)/.test(normalized)) return "decimal";
  if (normalized === "BOOLEAN") return "boolean";
  if (normalized === "DATE") return "date";
  if (normalized.startsWith("TIMESTAMP")) return "timestamp";
  return "text";
}

function inferSemanticType(
  name: string,
  inferredType: DatasetColumnProfileContract["inferredType"],
  distinctCount: number,
  rowCount: number
): DatasetColumnProfileContract["semanticType"] {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (/(^|_)(id|uuid|key|code)($|_)/.test(normalized)) return "identifier";
  if (inferredType === "date" || inferredType === "timestamp") return "date";
  if (inferredType === "integer" || inferredType === "decimal") return "numeric";
  if (
    inferredType === "boolean" ||
    (rowCount > 0 && distinctCount <= Math.min(50, Math.ceil(rowCount * 0.2)))
  ) {
    return "categorical";
  }
  return "free_text";
}

function createSuggestedPrompts(
  columns: readonly DatasetColumnProfileContract[]
): string[] {
  const prompts: string[] = [];
  const numeric = columns.find((column) => column.semanticType === "numeric");
  const category = columns.find((column) => column.semanticType === "categorical");
  const date = columns.find((column) => column.semanticType === "date");
  if (numeric)
    prompts.push(`Summarize ${promptColumn(numeric.originalName)} with key statistics.`);
  if (category)
    prompts.push(`Compare records by ${promptColumn(category.originalName)}.`);
  if (date) prompts.push(`Describe trends over ${promptColumn(date.originalName)}.`);
  prompts.push("Which columns contain missing values?");
  prompts.push("Which columns look useful for grouping the data?");
  prompts.push("Give me a concise overview of this dataset.");
  return [...new Set(prompts)].slice(0, 6);
}

function promptColumn(value: string): string {
  return `"${truncate(value.replace(/[\r\n\t]+/g, " "), 80)}"`;
}

function quoteIdentifier(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : truncate(String(value), 500);
}

function nullableFiniteNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function asSafeInteger(value: unknown): number {
  const number = typeof value === "bigint" ? Number(value) : Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error("DuckDB returned an invalid count.");
  }
  return number;
}

function truncate(value: string, length: number): string {
  return value.length <= length ? value : value.slice(0, length);
}

function round(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function isUnsupportedControl(character: string, delimiter: string): boolean {
  const code = character.charCodeAt(0);
  return code === 0 || (code < 32 && !["\n", "\r", "\t", delimiter].includes(character));
}

function duckDbMaxLineSize(options: DuckDbCsvProfilerOptions): number {
  const memoryBound = Math.floor((options.memoryLimitMb * 1024 * 1024) / 32);
  return Math.max(1_000_000, Math.min(options.maxBytes, memoryBound));
}

function utf8Length(character: string): number {
  const codePoint = character.codePointAt(0) ?? 0;
  if (codePoint <= 0x7f) return 1;
  if (codePoint <= 0x7ff) return 2;
  if (codePoint <= 0xffff) return 3;
  return 4;
}

function invalid(
  code: ConstructorParameters<typeof DatasetFileValidationError>[0],
  message: string
) {
  return new DatasetFileValidationError(code, message);
}

function validateOptions(options: DuckDbCsvProfilerOptions): void {
  if (
    !Number.isInteger(options.maxBytes) ||
    options.maxBytes < 1 ||
    !Number.isInteger(options.maxRows) ||
    options.maxRows < 1 ||
    !Number.isInteger(options.maxColumns) ||
    options.maxColumns < 1 ||
    !Number.isInteger(options.maxFieldCharacters) ||
    options.maxFieldCharacters < 1 ||
    options.maxMalformedRowRatio < 0 ||
    options.maxMalformedRowRatio > 0.1 ||
    !Number.isInteger(options.timeoutMs) ||
    options.timeoutMs < 1 ||
    !Number.isInteger(options.memoryLimitMb) ||
    options.memoryLimitMb < 64
  ) {
    throw new Error("Invalid DuckDB CSV profiler options.");
  }
}
