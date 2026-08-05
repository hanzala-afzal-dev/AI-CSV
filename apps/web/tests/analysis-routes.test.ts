import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const userId = "11111111-1111-4111-8111-111111111111";
  const resultId = "22222222-2222-4222-8222-222222222222";
  return {
    userId,
    resultId,
    getArtifact: vi.fn()
  };
});

const session = {
  id: "33333333-3333-4333-8333-333333333333",
  userId: state.userId,
  csrfHash: "stored-csrf-hash",
  createdAt: new Date("2026-08-05T10:00:00.000Z"),
  lastSeenAt: new Date("2026-08-05T11:59:00.000Z"),
  idleExpiresAt: new Date("2026-08-05T13:00:00.000Z"),
  absoluteExpiresAt: new Date("2026-08-12T10:00:00.000Z"),
  user: {
    id: state.userId,
    email: "alice@example.com",
    pendingEmail: null,
    displayName: "Alice",
    emailVerified: true
  }
};

vi.mock("../src/server/runtime", () => ({
  getRuntime: () => ({
    env: {
      SESSION_COOKIE_NAME: "agentic_csv_session"
    },
    identityService: {
      authenticateSession: vi.fn(async (token: string) =>
        token === "valid-session" ? session : null
      )
    },
    logger: { warn: vi.fn(), error: vi.fn() },
    analysisRepository: {
      getArtifact: state.getArtifact
    }
  })
}));

import { GET as getAnalysisResult } from "../src/app/api/v1/analysis/results/[resultId]/route";

const correlationId = "44444444-4444-4444-8444-444444444444";
const artifact = {
  messageId: "55555555-5555-4555-8555-555555555555",
  result: {
    id: state.resultId,
    planId: "66666666-6666-4666-8666-666666666666",
    runId: "77777777-7777-4777-8777-777777777777",
    datasetId: "88888888-8888-4888-8888-888888888888",
    datasetVersionId: "99999999-9999-4999-8999-999999999999",
    planHash: "a".repeat(64),
    schema: [
      { field: "country", label: "Country", dataType: "category" },
      { field: "total_revenue", label: "Total revenue", dataType: "number" }
    ],
    rows: [{ country: "DE", total_revenue: 120 }],
    rowCount: 1,
    truncated: false,
    executionMs: 12,
    checksum: "b".repeat(64),
    provenance: {
      version: 1,
      datasetId: "88888888-8888-4888-8888-888888888888",
      datasetVersionId: "99999999-9999-4999-8999-999999999999",
      columnIds: [],
      aggregations: ["sum"],
      filters: [],
      timeGrain: null,
      resultRowCount: 1,
      truncated: false,
      assumptions: [],
      warnings: []
    },
    createdAt: "2026-08-05T12:00:00.000Z"
  },
  chart: {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    resultArtifactId: state.resultId,
    spec: {
      version: 1,
      type: "bar",
      title: "Revenue by country",
      x: { field: "country", label: "Country", dataType: "category" },
      series: [{ field: "total_revenue", label: "Total revenue" }],
      categoryField: "country",
      footnotes: []
    },
    createdAt: "2026-08-05T12:00:00.000Z"
  }
};

describe("analysis result route", () => {
  beforeEach(() => {
    state.getArtifact.mockReset().mockResolvedValue(artifact);
  });

  it("returns only the session-owned stored artifact", async () => {
    const response = await getAnalysisResult(authenticatedRequest(state.resultId), {
      params: Promise.resolve({ resultId: state.resultId })
    });

    expect(response.status).toBe(200);
    expect(state.getArtifact).toHaveBeenCalledWith(state.userId, state.resultId);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      data: { artifact: { result: { id: state.resultId } } },
      correlationId
    });
    expect(JSON.stringify(body)).not.toContain("objectKey");
    expect(JSON.stringify(body)).not.toContain("userId");
  });

  it("uses the same not-found response for absent and foreign artifacts", async () => {
    state.getArtifact.mockResolvedValueOnce(null);
    const response = await getAnalysisResult(authenticatedRequest(state.resultId), {
      params: Promise.resolve({ resultId: state.resultId })
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "ANALYSIS_RESULT_NOT_FOUND",
        message: "Analysis result was not found."
      }
    });
  });

  it("requires a valid browser session", async () => {
    const response = await getAnalysisResult(anonymousRequest(state.resultId), {
      params: Promise.resolve({ resultId: state.resultId })
    });

    expect(response.status).toBe(401);
    expect(state.getArtifact).not.toHaveBeenCalled();
  });
});

function authenticatedRequest(resultId: string) {
  return new Request(`https://csv.example.com/api/v1/analysis/results/${resultId}`, {
    headers: {
      cookie: "agentic_csv_session=valid-session",
      "x-correlation-id": correlationId
    }
  });
}

function anonymousRequest(resultId: string) {
  return new Request(`https://csv.example.com/api/v1/analysis/results/${resultId}`, {
    headers: { "x-correlation-id": correlationId }
  });
}
