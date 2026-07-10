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

const ownerId = "11111111-1111-4111-8111-111111111111";
const datasetId = "22222222-2222-4222-8222-222222222222";
const uploadIntentId = "33333333-3333-4333-8333-333333333333";
const checksumSha256 = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

class FakeObjectStorage implements ObjectStorage {
  public metadata: StoredObjectMetadata = {
    sizeBytes: 128,
    contentType: "text/csv",
    checksumSha256,
    ownerId,
    datasetId
  };

  public async isReady(): Promise<boolean> {
    return true;
  }

  public createObjectKey(): string {
    return "owners/owner/datasets/dataset/uploads/intent/sales.csv";
  }

  public async createPresignedUpload() {
    return {
      objectKey: this.createObjectKey(),
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

  public execute<TResult>(
    work: (transaction: ApplicationTransaction) => Promise<TResult>
  ): Promise<TResult> {
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
    ownerId,
    name: "Sales",
    originalFilename: "sales.csv"
  });
  dataset.pullDomainEvents();
  const intent: DatasetUploadIntent = {
    id: uploadIntentId,
    ownerId,
    datasetId,
    objectKey: "owners/owner/datasets/dataset/uploads/intent/sales.csv",
    contentType: "text/csv",
    sizeBytes: 128,
    checksumSha256,
    expiresAt: new Date("2026-01-01T01:00:00.000Z"),
    completedAt: null
  };
  const publishedEvents: DomainEvent[] = [];
  const ingestionRequests: unknown[] = [];
  let idempotencyResponse: unknown;

  const transaction: ApplicationTransaction = {
    datasets: {
      async save() {},
      async findById() {
        return dataset;
      },
      async findByIdForOwner() {
        return dataset;
      }
    },
    events: {
      async publish(events) {
        publishedEvents.push(...events);
      }
    },
    uploadIntents: {
      async create() {},
      async findByIdForOwner() {
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
        ownerId,
        datasetId,
        contentType: "text/csv",
        sizeBytes: 101,
        checksumSha256
      })
    ).rejects.toMatchObject({ code: "UPLOAD_TOO_LARGE" });
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
    expect(fixture.idempotencyResponse).toEqual(result);
  });

  it("replays a completed idempotent request without mutating state", async () => {
    const response = { datasetId, status: "uploaded", ingestionRequested: true };
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
    ownerId,
    datasetId,
    uploadIntentId,
    idempotencyKey: "upload-completion-key",
    requestHash: "request-hash",
    correlationId: "44444444-4444-4444-8444-444444444444",
    now: new Date("2026-01-01T00:00:00.000Z")
  } as const;
}
