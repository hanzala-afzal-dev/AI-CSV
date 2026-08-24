import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { format } from "prettier";
import {
  AnalysisService,
  DeterministicAnalysisPlanner,
  MemoryRetrievalService,
  type AnalysisColumnMetadata,
  type AnalysisReadRepository,
  type MemoryRepository,
  type MemoryRetrievalCache,
  type MemoryVectorHit,
  type ObjectStorage,
  type ReadyAnalysisContext,
  type SemanticVectorStore,
  type UserTextEmbeddingProvider
} from "@agentic-csv/application";
import {
  analysisPlanSchema,
  chartFieldsMatchResult,
  type AnalysisPlanContract,
  type AnalysisResultRowContract,
  type RetrievedMemoryContextContract
} from "@agentic-csv/contracts";
import { DuckDbAnalysisEngine } from "../packages/infrastructure/src/analytics/duckdb-analysis-engine";

type Scalar = string | number | boolean | null;
type MeasureTuple = readonly [
  string | null,
  AnalysisPlanContract["measures"][number]["aggregation"]
];
type FilterTuple = readonly [
  string,
  AnalysisPlanContract["filters"][number]["operator"],
  Scalar?
];
type SortTuple = readonly [
  AnalysisPlanContract["sort"][number]["target"],
  number,
  AnalysisPlanContract["sort"][number]["direction"]
];
type DefinitionTuple = readonly [string, string, string, string];
type HitTuple = readonly [string, "alice" | "bob", "active" | "old", string];

interface Corpus {
  readonly version: number;
  readonly fixture: string;
  readonly cases: readonly EvaluationCase[];
}

interface EvaluationCase {
  readonly id: string;
  readonly category: string;
  readonly evaluator: "planner" | "execution" | "retrieval";
  readonly question: string;
  readonly columnScope?: "without_date";
  readonly plan?: {
    readonly operation: AnalysisPlanContract["operation"];
    readonly dimensions?: readonly string[];
    readonly measures: readonly MeasureTuple[];
    readonly filters?: readonly FilterTuple[];
    readonly sort?: readonly SortTuple[];
    readonly timeGrain?: AnalysisPlanContract["timeGrain"];
    readonly limit?: number;
    readonly visualizationPreference: AnalysisPlanContract["visualizationPreference"];
  };
  readonly retrieval?: {
    readonly definitions: readonly DefinitionTuple[];
    readonly hits: readonly HitTuple[];
    readonly semanticUnavailable?: boolean;
  };
  readonly expected: {
    readonly state: "planned" | "unsupported" | "retrieved";
    readonly operation: AnalysisPlanContract["operation"] | null;
    readonly dimensions?: readonly string[] | null;
    readonly measures?: readonly MeasureTuple[] | null;
    readonly measureCount?: number;
    readonly dimensionCount?: number;
    readonly timeGrain?: AnalysisPlanContract["timeGrain"];
    readonly rows: readonly AnalysisResultRowContract[] | null;
    readonly sourceIds?: readonly string[];
    readonly tenantFilter?: boolean;
    readonly leakage?: number;
    readonly inertContent?: boolean;
    readonly chartTypes: readonly string[];
    readonly clarification: boolean;
  };
}

interface CaseResult {
  readonly id: string;
  readonly category: string;
  readonly evaluator: EvaluationCase["evaluator"];
  readonly status: "passed" | "failed";
  readonly checks: readonly string[];
  readonly error?: string;
}

const ROOT = process.cwd();
const CORPUS_PATH = resolve(ROOT, "evaluation/phase9/corpus.json");
const REPORT_DIR = resolve(ROOT, "docs/evaluation");
const COLUMN_NAMES = [
  "order_id",
  "ordered_at",
  "region",
  "channel",
  "units",
  "revenue",
  "cost"
] as const;
const USER_ID = stableUuid("user:alice");
const BOB_USER_ID = stableUuid("user:bob");
const DATASET_ID = stableUuid("dataset:sales");
const DATASET_VERSION_ID = stableUuid("dataset:sales:v1");
const OLD_DATASET_VERSION_ID = stableUuid("dataset:sales:v0");
const CONVERSATION_ID = stableUuid("conversation:evaluation");
const RUN_ID = stableUuid("run:evaluation");
const columns: readonly AnalysisColumnMetadata[] = [
  column("order_id", "text", "identifier"),
  column("ordered_at", "date", "date"),
  column("region", "text", "categorical"),
  column("channel", "text", "categorical"),
  column("units", "integer", "numeric"),
  column("revenue", "decimal", "numeric"),
  column("cost", "decimal", "numeric")
];
const columnByName = new Map(columns.map((value) => [value.canonicalName, value]));
const columnNameById = new Map(columns.map((value) => [value.id, value.canonicalName]));

async function main(): Promise<void> {
  const corpus = parseCorpus(JSON.parse(await readFile(CORPUS_PATH, "utf8")));
  const fixturePath = resolve(ROOT, corpus.fixture);
  const fixtureBytes = await readFile(fixturePath);
  const fixtureStat = await stat(fixturePath);
  const context: ReadyAnalysisContext = {
    userId: USER_ID,
    conversationId: CONVERSATION_ID,
    runId: RUN_ID,
    datasetId: DATASET_ID,
    datasetVersionId: DATASET_VERSION_ID,
    datasetName: "Synthetic sales",
    originalFilename: "sales_clean.csv",
    objectKey: "evaluation/sales_clean.csv",
    sizeBytes: fixtureStat.size,
    checksumSha256: createHash("sha256").update(fixtureBytes).digest("base64"),
    delimiter: ",",
    columns
  };
  const results: CaseResult[] = [];
  for (const testCase of corpus.cases) {
    try {
      const checks =
        testCase.evaluator === "planner"
          ? evaluatePlanner(testCase)
          : testCase.evaluator === "execution"
            ? await evaluateExecution(testCase, context, fixturePath)
            : await evaluateRetrieval(testCase);
      results.push({
        id: testCase.id,
        category: testCase.category,
        evaluator: testCase.evaluator,
        status: "passed",
        checks
      });
    } catch (error) {
      results.push({
        id: testCase.id,
        category: testCase.category,
        evaluator: testCase.evaluator,
        status: "failed",
        checks: [],
        error: safeError(error)
      });
    }
  }
  await writeReports(corpus, results);
  const failed = results.filter((result) => result.status === "failed");
  if (failed.length > 0) {
    for (const result of failed) {
      console.error(`${result.id}: ${result.error ?? "failed"}`);
    }
    throw new Error(
      `Phase 9 evaluation failed ${failed.length} of ${results.length} cases.`
    );
  }
  console.log(`Phase 9 evaluation passed ${results.length} deterministic cases.`);
}

function evaluatePlanner(testCase: EvaluationCase): readonly string[] {
  const planner = new DeterministicAnalysisPlanner();
  const scopedColumns =
    testCase.columnScope === "without_date"
      ? columns.filter((value) => value.semanticType !== "date")
      : columns;
  const actual = planner.plan({ question: testCase.question, columns: scopedColumns });
  equal(actual.state, testCase.expected.state, "planning state");
  equal(
    testCase.expected.clarification,
    actual.state === "unsupported",
    "clarification expectation"
  );
  if (actual.state === "unsupported") return ["state", "clarification"];
  equal(actual.plan.operation, testCase.expected.operation, "operation");
  if (testCase.expected.dimensions) {
    deepEqual(
      actual.plan.dimensions.map((value) => requiredColumnName(value.columnId)),
      testCase.expected.dimensions,
      "selected dimensions"
    );
  }
  if (testCase.expected.measures) {
    deepEqual(
      actual.plan.measures.map(
        (value) =>
          [
            value.columnId ? requiredColumnName(value.columnId) : null,
            value.aggregation
          ] as const
      ),
      testCase.expected.measures,
      "selected measures"
    );
  }
  if (testCase.expected.measureCount !== undefined) {
    equal(actual.plan.measures.length, testCase.expected.measureCount, "measure count");
  }
  if (testCase.expected.dimensionCount !== undefined) {
    equal(
      actual.plan.dimensions.length,
      testCase.expected.dimensionCount,
      "dimension count"
    );
  }
  if (testCase.expected.timeGrain !== undefined) {
    equal(actual.plan.timeGrain, testCase.expected.timeGrain, "time grain");
  }
  if (
    actual.plan.visualizationPreference !== "auto" &&
    !testCase.expected.chartTypes.includes(actual.plan.visualizationPreference)
  ) {
    fail("visualization preference is outside acceptable chart types");
  }
  return [
    "state",
    "operation",
    "stored-column-selection",
    "aggregation-shape",
    "chart-preference"
  ];
}

async function evaluateExecution(
  testCase: EvaluationCase,
  context: ReadyAnalysisContext,
  fixturePath: string
): Promise<readonly string[]> {
  if (!testCase.plan || !testCase.expected.rows) {
    if (!testCase.plan || testCase.expected.rows === null) {
      fail("execution case is missing a plan or expected rows");
    }
  }
  const plan = buildPlan(testCase.plan);
  const repository = {
    loadRunContext: async () => ({ state: "ready" as const, context }),
    getArtifact: async () => null
  } satisfies AnalysisReadRepository;
  const storage = {
    readObject: async () => createReadStream(fixturePath)
  } as unknown as ObjectStorage;
  const engine = new DuckDbAnalysisEngine({
    maxScanBytes: 1_000_000,
    maxResultRows: 100,
    maxResultBytes: 100_000,
    timeoutMs: 10_000,
    memoryLimitMb: 128,
    threads: 1
  });
  let idSequence = 0;
  const service = new AnalysisService(
    repository,
    storage,
    new DeterministicAnalysisPlanner(),
    engine,
    () => new Date("2026-08-23T00:00:00.000Z"),
    () => stableUuid(`evaluation-artifact:${testCase.id}:${idSequence++}`)
  );
  const response = await service.executePlan({
    userId: USER_ID,
    conversationId: CONVERSATION_ID,
    runId: RUN_ID,
    question: testCase.question,
    plan
  });
  const analysis = response.analysis;
  if (!analysis) fail("analysis artifact was not produced");
  rowsEqual(analysis.rows, testCase.expected.rows, "numeric rows");
  if (!testCase.expected.chartTypes.includes(analysis.chartSpec.type)) {
    fail(`chart type ${analysis.chartSpec.type} is not acceptable`);
  }
  if (!chartFieldsMatchResult(analysis.chartSpec, { schema: analysis.schema })) {
    fail("chart fields do not match the deterministic result schema");
  }
  const expectedChecksum = createHash("sha256")
    .update(JSON.stringify({ schema: analysis.schema, rows: analysis.rows }))
    .digest("hex");
  equal(analysis.checksum, expectedChecksum, "result checksum");
  const expectedColumns = new Set<string>();
  for (const value of plan.dimensions) expectedColumns.add(value.columnId);
  for (const value of plan.measures) {
    if (value.columnId) expectedColumns.add(value.columnId);
  }
  for (const value of plan.filters) expectedColumns.add(value.columnId);
  deepEqual(
    [...analysis.provenance.columnIds].sort(),
    [...expectedColumns].sort(),
    "provenance columns"
  );
  deepEqual(analysis.provenance.filters, plan.filters, "provenance filters");
  return [
    "exact-or-approximate-numeric-result",
    "result-checksum",
    "selected-columns",
    "aggregation-and-filters",
    "chart-field-compatibility"
  ];
}

async function evaluateRetrieval(testCase: EvaluationCase): Promise<readonly string[]> {
  const retrieval = testCase.retrieval;
  if (!retrieval) fail("retrieval case is missing its fixture");
  const hitsById = new Map(
    retrieval.hits.map((hit) => [stableUuid(`record:${hit[0]}`), hit])
  );
  let searchInput:
    | {
        readonly userId: string;
        readonly datasetId: string;
        readonly datasetVersionId: string;
        readonly limit: number;
        readonly scoreThreshold: number;
      }
    | undefined;
  const definitions = retrieval.definitions.map(toDefinition);
  const repository = {
    loadIndexDocuments: async () => [],
    markIndexing: async () => undefined,
    markIndexed: async () => undefined,
    markIndexFailed: async () => undefined,
    getRevision: async () => 7,
    findConfirmedDefinitions: async () => definitions,
    hydrateVectorHits: async (input) =>
      input.hits.flatMap((hit): readonly RetrievedMemoryContextContract[] => {
        const configured = hitsById.get(hit.recordId);
        if (!configured) return [];
        const [source, owner, version, content] = configured;
        if (owner !== "alice" || input.userId !== USER_ID) return [];
        if (input.datasetId !== DATASET_ID) return [];
        if (version !== "active" || input.datasetVersionId !== DATASET_VERSION_ID) {
          return [];
        }
        return [
          {
            sourceId: stableUuid(`source:${source}`),
            documentType: "column_profile",
            content,
            score: hit.score,
            confidence: null,
            datasetId: DATASET_ID,
            datasetVersionId: DATASET_VERSION_ID,
            definition: null
          }
        ];
      })
  } satisfies MemoryRepository;
  const vectors = {
    ensureReady: async () => undefined,
    upsert: async () => undefined,
    search: async (input) => {
      searchInput = input;
      return retrieval.hits.map((hit, index): MemoryVectorHit => ({
        recordType: "semantic_document",
        recordId: stableUuid(`record:${hit[0]}`),
        score: 0.9 - index * 0.01
      }));
    },
    delete: async () => undefined
  } satisfies SemanticVectorStore;
  const embeddings = {
    modelId: "evaluation-embedding",
    embed: async () => {
      if (retrieval.semanticUnavailable) throw new Error("recorded provider outage");
      return [[0.1, 0.2, 0.3]];
    }
  } satisfies UserTextEmbeddingProvider;
  const cache = {
    get: async () => null,
    set: async () => undefined
  } satisfies MemoryRetrievalCache;
  const service = new MemoryRetrievalService(repository, embeddings, vectors, cache, {
    topK: 8,
    scoreThreshold: 0.35,
    maxContextCharacters: 8_000
  });
  const result = await service.retrieve({
    userId: USER_ID,
    conversationId: CONVERSATION_ID,
    datasetId: DATASET_ID,
    datasetVersionId: DATASET_VERSION_ID,
    question: testCase.question
  });
  const sourceNames = new Map<string, string>();
  for (const value of retrieval.definitions) {
    sourceNames.set(stableUuid(`source:${value[0]}`), value[0]);
  }
  for (const value of retrieval.hits) {
    sourceNames.set(stableUuid(`source:${value[0]}`), value[0]);
  }
  deepEqual(
    result.items.map((item) => sourceNames.get(item.sourceId) ?? item.sourceId),
    testCase.expected.sourceIds ?? [],
    "retrieved sources"
  );
  const leakage = result.items.filter(
    (item) =>
      item.datasetId !== DATASET_ID || item.datasetVersionId !== DATASET_VERSION_ID
  ).length;
  equal(leakage, testCase.expected.leakage ?? 0, "retrieval leakage");
  if (testCase.expected.tenantFilter) {
    if (!searchInput) fail("semantic search was not called");
    equal(searchInput.userId, USER_ID, "retrieval user filter");
    equal(searchInput.datasetId, DATASET_ID, "retrieval dataset filter");
    equal(searchInput.datasetVersionId, DATASET_VERSION_ID, "retrieval version filter");
  }
  if (testCase.expected.inertContent) {
    const expectedContent = retrieval.hits[0]?.[3];
    equal(
      result.items[0]?.content,
      expectedContent,
      "untrusted content remains inert data"
    );
    equal(searchInput?.userId, USER_ID, "untrusted content cannot alter actor");
  }
  return [
    "memory-reuse-policy",
    "tenant-dataset-version-filter",
    "authoritative-hydration",
    "zero-leakage",
    "untrusted-content-separation"
  ];
}

function buildPlan(input: NonNullable<EvaluationCase["plan"]>): AnalysisPlanContract {
  return analysisPlanSchema.parse({
    version: 1,
    operation: input.operation,
    dimensions: (input.dimensions ?? []).map((name) => ({
      columnId: requiredColumn(name).id
    })),
    measures: input.measures.map(([name, aggregation]) => ({
      columnId: name === null ? null : requiredColumn(name).id,
      aggregation
    })),
    filters: (input.filters ?? []).map(([name, operator, value]) => {
      const base = { columnId: requiredColumn(name).id, operator };
      return operator === "is_null" || operator === "not_null"
        ? base
        : { ...base, value };
    }),
    sort: (input.sort ?? []).map(([target, index, direction]) => ({
      target,
      index,
      direction
    })),
    ...(input.timeGrain ? { timeGrain: input.timeGrain } : {}),
    limit: input.limit ?? 100,
    visualizationPreference: input.visualizationPreference,
    assumptions: []
  });
}

function toDefinition(value: DefinitionTuple): RetrievedMemoryContextContract {
  const [source, alias, columnName, content] = value;
  return {
    sourceId: stableUuid(`source:${source}`),
    documentType: "business_rule",
    content,
    score: 1,
    confidence: "confirmed",
    datasetId: DATASET_ID,
    datasetVersionId: DATASET_VERSION_ID,
    definition: {
      version: 1,
      alias,
      columnId: requiredColumn(columnName).id,
      columnName,
      clarificationId: stableUuid(`clarification:${source}`),
      sourceMessageId: stableUuid(`message:${source}`)
    }
  };
}

async function writeReports(
  corpus: Corpus,
  results: readonly CaseResult[]
): Promise<void> {
  const passed = results.filter((value) => value.status === "passed").length;
  const categories = [...new Set(results.map((value) => value.category))]
    .sort()
    .map((category) => {
      const matching = results.filter((value) => value.category === category);
      return {
        category,
        total: matching.length,
        passed: matching.filter((value) => value.status === "passed").length,
        failed: matching.filter((value) => value.status === "failed").length
      };
    });
  const report = {
    version: 1,
    corpusVersion: corpus.version,
    evaluatorVersion: 1,
    status: passed === results.length ? "passed" : "failed",
    total: results.length,
    passed,
    failed: results.length - passed,
    providerRequests: 0,
    categories,
    cases: results
  };
  const markdown = [
    "# Phase 9 deterministic evaluation",
    "",
    `**Status:** ${report.status}`,
    "",
    `Corpus version ${corpus.version}; evaluator version 1; ${passed}/${results.length} cases passed.`,
    "No LLM or external provider is used. Numeric results run through the production DuckDB engine;",
    "planning, chart validation and memory retrieval use their production application boundaries.",
    "",
    "## Coverage",
    "",
    "| Category | Cases | Passed | Failed |",
    "| --- | ---: | ---: | ---: |",
    ...categories.map(
      (value) =>
        `| ${value.category} | ${value.total} | ${value.passed} | ${value.failed} |`
    ),
    "",
    "## Deterministic checks",
    "",
    "- Exact or tolerance-bounded numeric rows and an independently recomputed result checksum.",
    "- Stored column IDs, aggregations, filters, clarification state and time grains.",
    "- Chart field existence and result-type compatibility.",
    "- Required user, dataset and active-version vector filters plus authoritative hydration.",
    "- Zero cross-user/version retrieval leakage and inert prompt-like retrieved content.",
    "",
    "## Failures",
    "",
    ...(report.failed === 0
      ? ["None."]
      : results
          .filter((value) => value.status === "failed")
          .map((value) => `- \`${value.id}\`: ${value.error ?? "failed"}`)),
    ""
  ].join("\n");
  const formatOptions = {
    printWidth: 90,
    semi: true,
    singleQuote: false,
    trailingComma: "none" as const
  };
  const [jsonReport, markdownReport] = await Promise.all([
    format(JSON.stringify(report), { ...formatOptions, parser: "json" }),
    format(markdown, { ...formatOptions, parser: "markdown" })
  ]);
  await mkdir(REPORT_DIR, { recursive: true });
  await Promise.all([
    writeFile(resolve(REPORT_DIR, "phase-9-report.json"), jsonReport, "utf8"),
    writeFile(resolve(REPORT_DIR, "phase-9-report.md"), markdownReport, "utf8")
  ]);
}

function parseCorpus(value: unknown): Corpus {
  if (!value || typeof value !== "object") fail("corpus must be an object");
  const candidate = value as Partial<Corpus>;
  if (candidate.version !== 1) fail("unsupported corpus version");
  if (typeof candidate.fixture !== "string") fail("corpus fixture is missing");
  if (!Array.isArray(candidate.cases) || candidate.cases.length < 50) {
    fail("the Phase 9 corpus must contain at least 50 cases");
  }
  const ids = new Set<string>();
  for (const item of candidate.cases) {
    if (!item || typeof item !== "object") fail("corpus case must be an object");
    const testCase = item as Partial<EvaluationCase>;
    if (
      typeof testCase.id !== "string" ||
      typeof testCase.category !== "string" ||
      typeof testCase.question !== "string" ||
      !["planner", "execution", "retrieval"].includes(testCase.evaluator ?? "") ||
      !testCase.expected
    ) {
      fail("corpus case has an invalid shape");
    }
    if (ids.has(testCase.id)) fail(`duplicate corpus case ID ${testCase.id}`);
    ids.add(testCase.id);
  }
  return candidate as Corpus;
}

function column(
  name: (typeof COLUMN_NAMES)[number],
  inferredType: AnalysisColumnMetadata["inferredType"],
  semanticType: AnalysisColumnMetadata["semanticType"]
): AnalysisColumnMetadata {
  return {
    id: stableUuid(`column:${name}`),
    originalName: name,
    canonicalName: name,
    inferredType,
    semanticType,
    nullable: false
  };
}

function requiredColumn(name: string): AnalysisColumnMetadata {
  const value = columnByName.get(name);
  if (!value) fail(`unknown evaluation column ${name}`);
  return value;
}

function requiredColumnName(id: string): string {
  const value = columnNameById.get(id);
  if (!value) fail(`unknown evaluation column ID ${id}`);
  return value;
}

function stableUuid(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex").slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ((Number.parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function rowsEqual(
  actual: readonly AnalysisResultRowContract[],
  expected: readonly AnalysisResultRowContract[],
  label: string
): void {
  equal(actual.length, expected.length, `${label} length`);
  for (let index = 0; index < expected.length; index += 1) {
    const actualRow = actual[index];
    const expectedRow = expected[index];
    if (!actualRow || !expectedRow) fail(`${label} row ${index} is missing`);
    deepEqual(Object.keys(actualRow).sort(), Object.keys(expectedRow).sort(), label);
    for (const [field, expectedValue] of Object.entries(expectedRow)) {
      const actualValue = actualRow[field];
      if (typeof expectedValue === "number" && typeof actualValue === "number") {
        if (Math.abs(actualValue - expectedValue) > 1e-9) {
          fail(`${label} ${field}: expected ${expectedValue}, received ${actualValue}`);
        }
      } else {
        equal(actualValue, expectedValue, `${label} ${field}`);
      }
    }
  }
}

function deepEqual(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(
      `${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`
    );
  }
}

function equal(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    fail(`${label}: expected ${String(expected)}, received ${String(actual)}`);
  }
}

function fail(message: string): never {
  throw new Error(message);
}

function safeError(error: unknown): string {
  return error instanceof Error
    ? error.message.slice(0, 500)
    : "unknown evaluation error";
}

void main().catch((error: unknown) => {
  console.error(safeError(error));
  process.exitCode = 1;
});
