import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { QdrantClient } from "@qdrant/js-client-rest";
import { QdrantSemanticVectorStore } from "../src";

const userId = randomUUID();
const datasetId = randomUUID();
const datasetVersionId = randomUUID();
const conversationId = randomUUID();

describe("QdrantSemanticVectorStore", () => {
  it("rejects a missing trusted tenant filter before issuing a request", async () => {
    const client = qdrantClient();
    const store = new QdrantSemanticVectorStore(client.value, "memory-test", 2);

    await expect(
      store.search({
        userId: "",
        datasetId,
        datasetVersionId,
        vector: [0.1, 0.2],
        limit: 5,
        scoreThreshold: 0.3
      })
    ).rejects.toMatchObject({ code: "MEMORY_CONTEXT_INVALID" });
    expect(client.query).not.toHaveBeenCalled();
  });

  it("always filters private search by user, dataset, version and active status", async () => {
    const recordId = randomUUID();
    const client = qdrantClient();
    client.query.mockResolvedValueOnce({
      points: [
        {
          id: randomUUID(),
          version: 1,
          score: 0.91,
          payload: { recordId, recordType: "memory_record" }
        }
      ]
    } as never);
    const store = new QdrantSemanticVectorStore(client.value, "memory-test", 2);

    await expect(
      store.search({
        userId,
        datasetId,
        datasetVersionId,
        vector: [0.1, 0.2],
        limit: 5,
        scoreThreshold: 0.3
      })
    ).resolves.toEqual([{ recordId, recordType: "memory_record", score: 0.91 }]);

    expect(client.query).toHaveBeenCalledWith(
      "memory-test",
      expect.objectContaining({
        query: [0.1, 0.2],
        filter: {
          must: [
            { key: "userId", match: { value: userId } },
            { key: "datasetId", match: { value: datasetId } },
            { key: "datasetVersionId", match: { value: datasetVersionId } },
            { key: "status", match: { value: "active" } }
          ]
        }
      })
    );
  });

  it("deletes derived points using the trusted tenant and conversation scope", async () => {
    const client = qdrantClient();
    const store = new QdrantSemanticVectorStore(client.value, "memory-test", 2);

    await store.delete({ userId, conversationId });

    expect(client.delete).toHaveBeenCalledWith("memory-test", {
      wait: true,
      ordering: "medium",
      filter: {
        must: [
          { key: "userId", match: { value: userId } },
          { key: "conversationId", match: { value: conversationId } }
        ]
      }
    });
  });
});

function qdrantClient() {
  const query = vi.fn();
  const deletePoints = vi.fn(async () => undefined);
  return {
    query,
    delete: deletePoints,
    value: {
      query,
      delete: deletePoints
    } as unknown as QdrantClient
  };
}
