import { describe, expect, it } from "vitest";
import { Dataset, DatasetId, DomainError } from "../src";

const ownerId = "owner_123";
const originalFilename = "sales.csv";

describe("Dataset aggregate", () => {
  it("creates a pending dataset and emits an event", () => {
    const dataset = Dataset.create({ ownerId, name: "Sales", originalFilename });

    expect(dataset.status).toBe("pending_upload");
    expect(dataset.name).toBe("Sales");
    expect(dataset.peekDomainEvents()).toHaveLength(1);
    expect(dataset.peekDomainEvents()[0]?.name).toBe("dataset.created");
  });

  it("rejects invalid dataset names", () => {
    expect(() =>
      Dataset.create({ ownerId, name: " ".repeat(4), originalFilename })
    ).toThrow(DomainError);
  });

  it("supports valid lifecycle transitions", () => {
    const dataset = Dataset.create({ ownerId, name: "Sales", originalFilename });

    dataset.markUploaded("owners/owner_123/datasets/abc/sales.csv");
    dataset.startProfiling();
    dataset.markReady({ rowCount: 10, columnCount: 3 });

    expect(dataset.status).toBe("ready");
    expect(dataset.rowCount).toBe(10);
    expect(dataset.columnCount).toBe(3);
    expect(dataset.peekDomainEvents().map((event) => event.name)).toEqual([
      "dataset.created",
      "dataset.uploaded",
      "dataset.profiling_started",
      "dataset.ready"
    ]);
  });

  it("rejects invalid status transitions", () => {
    const dataset = Dataset.create({ ownerId, name: "Sales", originalFilename });

    expect(() => dataset.startProfiling()).toThrow(DomainError);
  });

  it("does not change state when an upload object key is invalid", () => {
    const dataset = Dataset.create({ ownerId, name: "Sales", originalFilename });
    dataset.pullDomainEvents();

    expect(() => dataset.markUploaded("   ")).toThrowError(DomainError);
    expect(dataset.status).toBe("pending_upload");
    expect(dataset.objectKey).toBeNull();
    expect(dataset.peekDomainEvents()).toHaveLength(0);
  });

  it("rejects invalid profiling statistics", () => {
    const dataset = Dataset.create({ ownerId, name: "Sales", originalFilename });
    dataset.markUploaded("owners/owner_123/datasets/abc/sales.csv");
    dataset.startProfiling();

    expect(() => dataset.markReady({ rowCount: -1, columnCount: 3 })).toThrow(
      DomainError
    );
    expect(() => dataset.markReady({ rowCount: 1, columnCount: 0 })).toThrow(DomainError);
  });

  it("requires a failure reason", () => {
    const dataset = Dataset.create({ ownerId, name: "Sales", originalFilename });

    expect(() => dataset.markFailed("   ")).toThrow(DomainError);
  });

  it("can retry an upload after a failure", () => {
    const dataset = Dataset.create({ ownerId, name: "Sales", originalFilename });
    dataset.markFailed("upload expired");

    dataset.retryUpload();

    expect(dataset.status).toBe("pending_upload");
    expect(dataset.failureReason).toBeNull();
    expect(dataset.peekDomainEvents().at(-1)?.name).toBe("dataset.upload_retried");
  });

  it("can rehydrate without emitting events", () => {
    const dataset = Dataset.rehydrate({
      id: DatasetId.from("11111111-1111-4111-8111-111111111111"),
      ownerId,
      name: "Sales",
      originalFilename,
      objectKey: null,
      status: "pending_upload",
      rowCount: null,
      columnCount: null,
      failureReason: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z")
    });

    expect(dataset.peekDomainEvents()).toHaveLength(0);
  });
});
