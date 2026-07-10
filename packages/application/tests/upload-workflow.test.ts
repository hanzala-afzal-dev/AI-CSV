import { describe, expect, it } from "vitest";
import {
  CompleteDatasetUploadHandler,
  DatasetWorkflowError,
  InitiateDatasetUploadHandler,
  type ApplicationTransaction,
  type DatasetUploadIntent,
  type IdempotencyReservation,
  type ObjectStorage,
  type StoredObjectMetadata,
  type UnitOfWork
} from "../src";
import { Dataset, type DomainEvent } from "@agentic-csv/domain";

const userId = "11111111-1111-4111-8111-111111111111";
const datasetId = "22222222-2222-4222-8222-222222222222";
const uploadIntentId = "33333333-3333-4333-8333-333333333333";
const datasetVersionId = "44444444-4444-4444-8444-444444444444";
const checksumSha256 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

class FakeObjectStorage implements ObjectStorage {
  public lastVersionId: string | undefined;
  public metadata: StoredObjectMetadata = {
    sizeBytes: 128,
    contentType: "text/csv",
    checksumSha256,
    userId,
    datasetId,
    datasetVersionId
  };

  public async isReady(): Promise<boolean> {
    return true;
  }

  public createObjectKey(): string {
    return "users/user/datasets/dataset/versions/intent/original.csv";
  }

  public async createPresignedUpload(request: { readonly datasetVersionId: string }) {
    this.lastVersionId = request.datasetVersionId;
    return {
      objectKey: `users/user/datasets/dataset/versions/${request.datasetVersionId}/original.csv`,
      uploadUrl: "https://storage.example/upload",
      requiredHeaders: {},
      expiresAt: new Date("2026-01-01T01:00:00.000Z")
    };
  }

  public async inspectObject(): Promise<StoredObjectMetadata> {
    return this.metadata;
  }
}

class FakeUnitOfWork implements UnitOfWork {
  public constructor(private readonly transaction: ApplicationTransaction) {}

  public executeForUser<TResult>(
    actorUserId: string,
    work: (transaction: ApplicationTransaction) => Promise<TResult>
  ): Promise<TResult> {
    expect(actorUserId).toBe(userId);
    return work(this.transaction);
  }
}

function createFixture(
  reservation: IdempotencyReservation = {
    acquired: true,
    requestHash: "request-hash",
    response: null,
    completed: false
  }
) {
  const dataset = Dataset.create({
    userId,
    name: "Sales",
    originalFilename: "sales.csv"
  });
  dataset.pullDomainEvents();
  const intent: DatasetUploadIntent = {
    id: uploadIntentId,
    userId,
    datasetId,
    datasetVersionId,
    objectKey: "users/user/datasets/dataset/versions/intent/original.csv",
    contentType: "text/csv",
    sizeBytes: 128,
    checksumSha256,
    expiresAt: new Date("2026-01-01T01:00:00.000Z"),
    completedAt: null
  };
  const publishedEvents: DomainEvent[] = [];
  const ingestionRequests: unknown[] = [];
  const versions: unknown[] = [];
  let idempotencyResponse: unknown;

  const transaction: ApplicationTransaction = {
    datasets: {
      async save() {},
      async findByIdForUser() {
        return dataset;
      }
    },
    datasetVersions: {
      async nextVersionNumber() {
        return 1;
      },
      async createPending(version) {
        versions.push(version);
      },
      async markUploaded(id, versionUserId) {
        versions.push({ id, userId: versionUserId, status: "uploaded" });
      }
    },
    events: {
      async publish(events) {
        publishedEvents.push(...events);
      }
    },
    uploadIntents: {
      async create() {},
      async findByIdForUser() {
        return intent;
      },
      async markCompleted(_id, completedAt) {
        Object.assign(intent, { completedAt });
      }
    },
    idempotency: {
      async find() {
        return reservation.acquired ? null : reservation;
      },
      async reserve() {
        return reservation;
      },
      async complete(input) {
        idempotencyResponse = input.response;
      }
    },
    ingestionRequests: {
      async publish(payload) {
        ingestionRequests.push(payload);
      }
    }
  };

  return {
    dataset,
    intent,
    unitOfWork: new FakeUnitOfWork(transaction),
    publishedEvents,
    ingestionRequests,
    versions,
    get idempotencyResponse() {
      return idempotencyResponse;
    }
  };
}

describe("dataset upload workflow", () => {
  it("rejects oversized uploads before creating an object-storage intent", async () => {
    const fixture = createFixture();
    const handler = new InitiateDatasetUploadHandler(
      fixture.unitOfWork,
      new FakeObjectStorage(),
      100,
      900
    );

    await expect(
      handler.execute({
        userId,
        datasetId,
        contentType: "text/csv",
        sizeBytes: 101,
        checksumSha256
      })
    ).rejects.toMatchObject({ code: "UPLOAD_TOO_LARGE" });
  });

  it("creates a persisted dataset version for the presigned object", async () => {
    const fixture = createFixture();
    const storage = new FakeObjectStorage();
    const handler = new InitiateDatasetUploadHandler(
      fixture.unitOfWork,
      storage,
      1_000,
      900
    );

    const result = await handler.execute({
      userId,
      datasetId,
      contentType: "text/csv",
      sizeBytes: 128,
      checksumSha256
    });

    expect(result.datasetVersionId).toBe(storage.lastVersionId);
    expect(fixture.versions).toContainEqual(
      expect.objectContaining({
        id: result.datasetVersionId,
        userId,
        datasetId,
        versionNumber: 1,
        checksum: checksumSha256
      })
    );
  });

  it("does not mutate a dataset when stored object metadata differs", async () => {
    const fixture = createFixture();
    const storage = new FakeObjectStorage();
    storage.metadata = { ...storage.metadata, sizeBytes: 127 };
    const handler = new CompleteDatasetUploadHandler(fixture.unitOfWork, storage);

    await expect(handler.execute(completionInput())).rejects.toMatchObject({
      code: "UPLOAD_OBJECT_METADATA_MISMATCH"
    });
    expect(fixture.dataset.status).toBe("pending_upload");
    expect(fixture.ingestionRequests).toHaveLength(0);
  });

  it("atomically records completion and requests ingestion", async () => {
    const fixture = createFixture();
    const handler = new CompleteDatasetUploadHandler(
      fixture.unitOfWork,
      new FakeObjectStorage()
    );

    const result = await handler.execute(completionInput());

    expect(result.status).toBe("uploaded");
    expect(fixture.dataset.status).toBe("uploaded");
    expect(fixture.publishedEvents.map((event) => event.name)).toContain(
      "dataset.uploaded"
    );
    expect(fixture.ingestionRequests).toHaveLength(1);
    expect(result.datasetVersionId).toBe(datasetVersionId);
    expect(fixture.idempotencyResponse).toEqual(result);
  });

  it("replays a completed idempotent request without mutating state", async () => {
    const response = {
      datasetId,
      datasetVersionId,
      status: "uploaded",
      ingestionRequested: true
    };
    const fixture = createFixture({
      acquired: false,
      requestHash: "request-hash",
      response,
      completed: true
    });
    const handler = new CompleteDatasetUploadHandler(
      fixture.unitOfWork,
      new FakeObjectStorage()
    );

    await expect(handler.execute(completionInput())).resolves.toEqual(response);
    expect(fixture.dataset.status).toBe("pending_upload");
    expect(fixture.ingestionRequests).toHaveLength(0);
  });

  it("rejects reuse of an idempotency key for another request", async () => {
    const fixture = createFixture({
      acquired: false,
      requestHash: "different-request",
      response: null,
      completed: true
    });
    const handler = new CompleteDatasetUploadHandler(
      fixture.unitOfWork,
      new FakeObjectStorage()
    );

    await expect(handler.execute(completionInput())).rejects.toBeInstanceOf(
      DatasetWorkflowError
    );
  });
});

function completionInput() {
  return {
    userId,
    datasetId,
    uploadIntentId,
    idempotencyKey: "upload-completion-key",
    requestHash: "request-hash",
    correlationId: "44444444-4444-4444-8444-444444444444",
    now: new Date("2026-01-01T00:00:00.000Z")
  } as const;
}
