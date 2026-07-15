import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as ApplicationModule from "@agentic-csv/application";

const state = vi.hoisted(() => {
  const userId = "11111111-1111-4111-8111-111111111111";
  const datasetId = "019f3bb6-9a18-7f82-85e0-86f1423eb80a";
  const versionId = "33333333-3333-4333-8333-333333333333";
  const intentId = "44444444-4444-4444-8444-444444444444";
  const now = new Date("2026-07-15T12:00:00.000Z");
  const version = {
    id: versionId,
    versionNumber: 1,
    originalFilename: "sales.csv",
    mimeType: "text/csv" as const,
    sizeBytes: 24,
    status: "ready" as const,
    failureCode: null,
    rowCount: 2,
    columnCount: 2,
    profileVersion: 1,
    createdAt: now,
    updatedAt: now
  };
  const dataset = {
    id: datasetId,
    name: "Sales",
    originalFilename: "sales.csv",
    status: "ready" as const,
    rowCount: 2,
    columnCount: 2,
    activeVersion: version,
    versions: [version],
    createdAt: now,
    updatedAt: now,
    userId,
    objectKey: `users/${userId}/datasets/${datasetId}/versions/${versionId}/original.csv`
  };
  const profile = {
    datasetId,
    datasetVersionId: versionId,
    profile: {
      version: 1 as const,
      rowCount: 2,
      columnCount: 1,
      encoding: "utf-8" as const,
      delimiter: "," as const,
      columns: [
        {
          ordinal: 0,
          originalName: "amount",
          canonicalName: "amount",
          inferredType: "integer" as const,
          semanticType: "numeric" as const,
          nullable: false,
          statistics: {
            version: 1 as const,
            nullCount: 0,
            nullPercentage: 0,
            distinctCount: 2,
            min: "10",
            max: "20",
            mean: 15,
            standardDeviation: 5,
            exampleValues: ["10", "20"]
          }
        }
      ],
      warnings: [],
      suggestedPrompts: [
        "Summarize amount.",
        "Which columns contain missing values?",
        "Give me an overview."
      ],
      generatedAt: now.toISOString()
    }
  };
  return {
    userId,
    datasetId,
    versionId,
    intentId,
    dataset,
    profile,
    denyPrefix: null as string | null,
    redisAvailable: true,
    rateLimitKeys: [] as string[],
    logger: { warn: vi.fn(), error: vi.fn() },
    create: vi.fn(),
    initiate: vi.fn(),
    complete: vi.fn(),
    datasetService: {
      list: vi.fn(),
      getDetail: vi.fn(),
      getProfile: vi.fn()
    }
  };
});

vi.mock("@agentic-csv/application", async (importOriginal) => {
  const actual = await importOriginal<typeof ApplicationModule>();
  return {
    ...actual,
    CreateDatasetCommandHandler: class {
      public execute(input: unknown) {
        return state.create(input);
      }
    },
    InitiateDatasetUploadHandler: class {
      public execute(input: unknown) {
        return state.initiate(input);
      }
    },
    CompleteDatasetUploadHandler: class {
      public execute(input: unknown) {
        return state.complete(input);
      }
    }
  };
});

const session = {
  id: "55555555-5555-4555-8555-555555555555",
  userId: state.userId,
  csrfHash: "stored-csrf-hash",
  createdAt: new Date("2026-07-15T10:00:00.000Z"),
  lastSeenAt: new Date("2026-07-15T11:59:00.000Z"),
  idleExpiresAt: new Date("2026-07-15T13:00:00.000Z"),
  absoluteExpiresAt: new Date("2026-07-22T10:00:00.000Z"),
  user: {
    id: state.userId,
    email: "alice@example.com",
    pendingEmail: null,
    displayName: "Alice",
    emailVerified: true
  }
};

vi.mock("../src/server/runtime", () => ({
  ensureRedisConnected: vi.fn(async () => {
    if (!state.redisAvailable) throw new Error("Redis unavailable");
  }),
  getRuntime: () => ({
    env: {
      APP_URL: "https://csv.example.com",
      AUTH_SECRET: "a".repeat(32),
      SESSION_COOKIE_NAME: "agentic_csv_session",
      SESSION_ABSOLUTE_TTL_SECONDS: 604800,
      NODE_ENV: "test",
      TRUST_PROXY: true,
      RATE_LIMIT_WINDOW_SECONDS: 60,
      RATE_LIMIT_MAX_REQUESTS: 100,
      RATE_LIMIT_UPLOAD_INTENT_MAX_REQUESTS: 10,
      RATE_LIMIT_UPLOAD_COMPLETION_MAX_REQUESTS: 20,
      UPLOAD_MAX_BYTES: 104857600,
      CSV_MAX_ROWS: 1000000,
      CSV_MAX_COLUMNS: 500,
      CSV_MAX_FIELD_CHARACTERS: 1000000,
      PRESIGNED_URL_TTL_SECONDS: 900
    },
    identityService: {
      authenticateSession: vi.fn(async (token: string) =>
        token === "valid-session" ? session : null
      ),
      verifyCsrf: vi.fn((_session: unknown, token: string) => token === "csrf-token")
    },
    rateLimiter: {
      check: vi.fn(async ({ key, limit }: { key: string; limit: number }) => {
        state.rateLimitKeys.push(key);
        const allowed = state.denyPrefix === null || !key.startsWith(state.denyPrefix);
        return {
          allowed,
          limit,
          remaining: allowed ? limit - 1 : 0,
          resetAt: new Date(Date.now() + 60_000)
        };
      })
    },
    logger: state.logger,
    unitOfWork: {},
    objectStorage: {},
    datasetService: state.datasetService
  })
}));

import { DatasetWorkflowError } from "@agentic-csv/application";
import {
  GET as listDatasets,
  POST as createDataset
} from "../src/app/api/v1/datasets/route";
import { GET as getDataset } from "../src/app/api/v1/datasets/[datasetId]/route";
import { GET as getDatasetProfile } from "../src/app/api/v1/datasets/[datasetId]/versions/[versionId]/profile/route";
import { POST as createUploadIntent } from "../src/app/api/v1/datasets/[datasetId]/upload/route";
import { POST as completeUpload } from "../src/app/api/v1/datasets/[datasetId]/upload/complete/route";

const correlationId = "66666666-6666-4666-8666-666666666666";

describe("dataset routes", () => {
  beforeEach(() => {
    state.denyPrefix = null;
    state.redisAvailable = true;
    state.rateLimitKeys.length = 0;
    state.logger.warn.mockReset();
    state.logger.error.mockReset();
    state.create.mockReset().mockResolvedValue({
      datasetId: state.datasetId,
      name: "Sales",
      originalFilename: "sales.csv",
      status: "pending_upload",
      createdAt: state.dataset.createdAt,
      updatedAt: state.dataset.updatedAt
    });
    state.initiate.mockReset().mockResolvedValue({
      uploadIntentId: state.intentId,
      datasetVersionId: state.versionId,
      uploadUrl: "http://localhost:4566/signed-upload",
      method: "PUT",
      requiredHeaders: {
        "content-type": "text/csv",
        "x-amz-checksum-sha256": "A".repeat(43) + "="
      },
      expiresAt: new Date("2026-07-15T12:15:00.000Z"),
      objectKey: "must-not-leak"
    });
    state.complete.mockReset().mockResolvedValue({
      datasetId: state.datasetId,
      datasetVersionId: state.versionId,
      status: "uploaded",
      ingestionRequested: true
    });
    state.datasetService.list.mockReset().mockResolvedValue([state.dataset]);
    state.datasetService.getDetail.mockReset().mockResolvedValue(state.dataset);
    state.datasetService.getProfile.mockReset().mockResolvedValue(state.profile);
  });

  it("lists only session-owned safe fields and configured limits", async () => {
    const response = await listDatasets(queryRequest("/datasets?limit=12"));
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(state.datasetService.list).toHaveBeenCalledWith(state.userId, 12);
    expect(body.data.limits).toMatchObject({ maxBytes: 104857600, maxRows: 1000000 });
    expect(serialized).not.toContain("objectKey");
    expect(serialized).not.toContain("userId");
    expect(serialized).not.toContain(`users/${state.userId}`);
  });

  it("uses the same not-found response for a foreign dataset", async () => {
    state.datasetService.getDetail.mockRejectedValueOnce(
      new DatasetWorkflowError("DATASET_NOT_FOUND", "Dataset was not found.")
    );
    const response = await getDataset(queryRequest(`/datasets/${state.datasetId}`), {
      params: Promise.resolve({ datasetId: state.datasetId })
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "DATASET_NOT_FOUND", message: "Dataset was not found." }
    });
  });

  it("returns a strict profile without internal storage context", async () => {
    const response = await getDatasetProfile(
      queryRequest(`/datasets/${state.datasetId}/versions/${state.versionId}/profile`),
      {
        params: Promise.resolve({
          datasetId: state.datasetId,
          versionId: state.versionId
        })
      }
    );
    const serialized = await response.text();

    expect(response.status).toBe(200);
    expect(serialized).toContain("amount");
    expect(serialized).not.toContain("objectKey");
    expect(state.datasetService.getProfile).toHaveBeenCalledWith(
      state.userId,
      state.datasetId,
      state.versionId
    );
  });

  it("rejects missing CSRF and ownership mass assignment before creating data", async () => {
    const withoutCsrf = await createDataset(
      mutationRequest("/datasets", { name: "Sales", originalFilename: "sales.csv" }, null)
    );
    const withOwnership = await createDataset(
      mutationRequest("/datasets", {
        name: "Sales",
        originalFilename: "sales.csv",
        userId: "22222222-2222-4222-8222-222222222222"
      })
    );

    expect(withoutCsrf.status).toBe(403);
    expect(withOwnership.status).toBe(422);
    expect(state.create).not.toHaveBeenCalled();
  });

  it("fails closed after checking both user and hashed-IP upload buckets", async () => {
    state.denyPrefix = "dataset:intent:ip:";
    const response = await createUploadIntent(
      mutationRequest(`/datasets/${state.datasetId}/upload`, uploadMetadata()),
      { params: Promise.resolve({ datasetId: state.datasetId }) }
    );

    expect(response.status).toBe(429);
    expect(state.rateLimitKeys).toHaveLength(3);
    expect(state.rateLimitKeys[0]).toBe(`browser:user:${state.userId}`);
    expect(state.rateLimitKeys[1]).toBe(`dataset:intent:user:${state.userId}`);
    expect(state.rateLimitKeys[2]).toMatch(/^dataset:intent:ip:[0-9a-f]{32}$/);
    expect(state.initiate).not.toHaveBeenCalled();

    state.redisAvailable = false;
    const unavailable = await createUploadIntent(
      mutationRequest(`/datasets/${state.datasetId}/upload`, uploadMetadata()),
      { params: Promise.resolve({ datasetId: state.datasetId }) }
    );
    expect(unavailable.status).toBe(503);
    expect(state.initiate).not.toHaveBeenCalled();
  });

  it("returns only the signed upload capability and derives ownership from the session", async () => {
    const response = await createUploadIntent(
      mutationRequest(`/datasets/${state.datasetId}/upload`, uploadMetadata()),
      { params: Promise.resolve({ datasetId: state.datasetId }) }
    );
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(201);
    expect(state.initiate).toHaveBeenCalledWith({
      userId: state.userId,
      datasetId: state.datasetId,
      ...uploadMetadata()
    });
    expect(serialized).toContain("signed-upload");
    expect(serialized).not.toContain("objectKey");
    expect(serialized).not.toContain("userId");
  });

  it("requires completion idempotency and never accepts a client object key", async () => {
    const missingKey = await completeUpload(
      mutationRequest(
        `/datasets/${state.datasetId}/upload/complete`,
        { uploadIntentId: state.intentId },
        "csrf-token",
        false
      ),
      { params: Promise.resolve({ datasetId: state.datasetId }) }
    );
    const injectedKey = await completeUpload(
      mutationRequest(
        `/datasets/${state.datasetId}/upload/complete`,
        { uploadIntentId: state.intentId, objectKey: "users/bob/data.csv" },
        "csrf-token",
        true
      ),
      { params: Promise.resolve({ datasetId: state.datasetId }) }
    );

    expect(missingKey.status).toBe(400);
    expect(injectedKey.status).toBe(422);
    expect(state.complete).not.toHaveBeenCalled();
  });
});

function uploadMetadata() {
  return {
    contentType: "text/csv" as const,
    sizeBytes: 24,
    checksumSha256: "A".repeat(43) + "="
  };
}

function mutationRequest(
  path: string,
  body: unknown,
  csrfToken: string | null = "csrf-token",
  idempotency = true
) {
  const headers = new Headers({
    "content-type": "application/json",
    origin: "https://csv.example.com",
    "sec-fetch-site": "same-origin",
    cookie: "agentic_csv_session=valid-session",
    "x-correlation-id": correlationId,
    "x-forwarded-for": "203.0.113.8"
  });
  if (csrfToken) headers.set("x-csrf-token", csrfToken);
  if (idempotency && path.endsWith("/complete")) {
    headers.set("idempotency-key", "completion-key-0001");
  }
  return new Request(`https://csv.example.com/api/v1${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
}

function queryRequest(path: string) {
  return new Request(`https://csv.example.com/api/v1${path}`, {
    headers: {
      cookie: "agentic_csv_session=valid-session",
      "x-correlation-id": correlationId
    }
  });
}
