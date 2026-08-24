import { describe, expect, it, vi } from "vitest";
import {
  PrivacyDeletionError,
  PrivacyDeletionProcessor,
  PrivacyDeletionService,
  type ObjectStorage,
  type PrivacyDeletionRepository,
  type PrivacyDeletionWork,
  type PrivacyEphemeralPurger,
  type SemanticVectorStore
} from "../src";

const userId = "11111111-1111-4111-8111-111111111111";
const datasetId = "22222222-2222-4222-8222-222222222222";
const deletionId = "33333333-3333-4333-8333-333333333333";
const clientRequestId = "44444444-4444-4444-8444-444444444444";
const now = new Date("2026-08-23T10:00:00.000Z");

function work(scope: "dataset" | "account" = "dataset"): PrivacyDeletionWork {
  return {
    id: deletionId,
    userId,
    scope,
    datasetId: scope === "dataset" ? datasetId : null,
    status: "scheduled",
    objectKeys: [
      `users/${userId}/datasets/${datasetId}/versions/v1/original.csv`,
      `users/${userId}/datasets/${datasetId}/versions/v1/original.csv`
    ],
    requestedAt: now
  };
}

function fixture(claimed: PrivacyDeletionWork | null = work()) {
  const calls: string[] = [];
  const repository: PrivacyDeletionRepository = {
    scheduleDataset: vi.fn(async (input) => ({
      ...work(),
      id: input.deletionId
    })),
    scheduleAccount: vi.fn(async (input) => ({
      ...work("account"),
      id: input.deletionId
    })),
    claim: vi.fn(async () => claimed),
    complete: vi.fn(async () => {
      calls.push("database");
    }),
    recordFailure: vi.fn()
  };
  const storage = {
    deleteObjects: vi.fn(async () => {
      calls.push("object");
    })
  } as unknown as ObjectStorage;
  const vectors = {
    ensureReady: vi.fn(async () => undefined),
    delete: vi.fn(async () => {
      calls.push("vector");
    })
  } as unknown as SemanticVectorStore;
  const ephemeral: PrivacyEphemeralPurger = {
    deleteDataset: vi.fn(async () => {
      calls.push("ephemeral");
    }),
    deleteUser: vi.fn(async () => {
      calls.push("ephemeral");
    })
  };
  return {
    calls,
    repository,
    storage,
    vectors,
    ephemeral,
    service: new PrivacyDeletionService(repository, () => now),
    processor: new PrivacyDeletionProcessor(
      repository,
      storage,
      vectors,
      ephemeral,
      () => now
    )
  };
}

describe("PrivacyDeletionService", () => {
  it("erases dataset derivatives before finalizing PostgreSQL", async () => {
    const subject = fixture();
    await subject.processor.process({
      version: 1,
      jobName: "privacy.delete.v1",
      correlationId: "correlation",
      idempotencyKey: `privacy:${deletionId}`,
      userId,
      deletionId
    });

    expect(subject.ephemeral.deleteDataset).toHaveBeenCalledWith({
      userId,
      datasetId
    });
    expect(subject.storage.deleteObjects).toHaveBeenCalledWith([work().objectKeys[0]]);
    expect(subject.vectors.delete).toHaveBeenCalledWith({ userId, datasetId });
    expect(subject.calls).toEqual(["ephemeral", "object", "vector", "database"]);
  });

  it("makes a redelivered completed job a no-op", async () => {
    const subject = fixture(null);
    await subject.processor.process({
      version: 1,
      jobName: "privacy.delete.v1",
      correlationId: "correlation",
      idempotencyKey: `privacy:${deletionId}`,
      userId,
      deletionId
    });
    expect(subject.storage.deleteObjects).not.toHaveBeenCalled();
    expect(subject.repository.complete).not.toHaveBeenCalled();
  });

  it("records a safe failure and leaves the job retryable", async () => {
    const subject = fixture();
    vi.mocked(subject.storage.deleteObjects).mockRejectedValueOnce(
      Object.assign(new Error("private provider detail"), {
        code: "OBJECT_UNAVAILABLE"
      })
    );
    await expect(
      subject.processor.process({
        version: 1,
        jobName: "privacy.delete.v1",
        correlationId: "correlation",
        idempotencyKey: `privacy:${deletionId}`,
        userId,
        deletionId
      })
    ).rejects.toThrow("private provider detail");
    expect(subject.repository.recordFailure).toHaveBeenCalledWith({
      deletionId,
      userId,
      failureCode: "OBJECT_UNAVAILABLE",
      failedAt: now
    });
    expect(subject.repository.complete).not.toHaveBeenCalled();
  });

  it("does not disclose a foreign or missing dataset", async () => {
    const subject = fixture();
    vi.mocked(subject.repository.scheduleDataset).mockResolvedValueOnce(null);
    await expect(
      subject.service.scheduleDataset({
        userId,
        datasetId,
        clientRequestId,
        correlationId: "correlation"
      })
    ).rejects.toEqual(
      new PrivacyDeletionError("DATASET_NOT_FOUND", "Dataset was not found.")
    );
  });
});
