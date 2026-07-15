import { describe, expect, it } from "vitest";
import { DatasetVersion, DomainError } from "../src";

describe("DatasetVersion aggregate", () => {
  it("guards the complete ingestion lifecycle", () => {
    const version = createVersion();

    version.markUploaded();
    version.markQueued();
    version.startValidation();
    version.startProfiling();
    version.startIndexing();
    version.markReady();

    expect(version.status).toBe("ready");
  });

  it("rejects skipped lifecycle states", () => {
    const version = createVersion();

    expect(() => version.startProfiling()).toThrow(DomainError);
    expect(version.status).toBe("pending_upload");
  });

  it("allows a claimed retry to restart validation idempotently", () => {
    const version = createVersion();
    version.markUploaded();
    version.markQueued();
    version.startValidation();
    version.startProfiling();

    version.restartValidation();
    version.restartValidation();

    expect(version.status).toBe("validating");
  });

  it("requires a safe failure code and deletion transition", () => {
    const version = createVersion();
    version.markUploaded();
    version.markQueued();
    version.startValidation();
    version.markFailed("DATASET_INVALID_FILE");
    expect(version.toPrimitives().failureCode).toBe("DATASET_INVALID_FILE");

    version.startDeleting();
    version.markDeleted();
    expect(version.status).toBe("deleted");
  });
});

function createVersion(): DatasetVersion {
  return DatasetVersion.create({
    id: "019f3bb6-9a18-7f82-85e0-86f1423eb80a",
    userId: "11111111-1111-4111-8111-111111111111",
    datasetId: "22222222-2222-4222-8222-222222222222",
    versionNumber: 1,
    now: new Date("2026-07-15T12:00:00.000Z")
  });
}
