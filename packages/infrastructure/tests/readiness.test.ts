import { afterEach, describe, expect, it, vi } from "vitest";
import { isQdrantReady } from "../src/vector/qdrant";

const env = {
  QDRANT_URL: "http://qdrant.test:6333",
  QDRANT_API_KEY: "test-api-key"
};
type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

describe("Qdrant readiness", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a bounded request with the configured API key", async () => {
    const fetchMock = vi.fn(async (_input: FetchInput, init?: FetchInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(init?.headers).toEqual({ "api-key": env.QDRANT_API_KEY });
      return new Response(null, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(isQdrantReady(env)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("aborts a Qdrant request that exceeds its timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: FetchInput, init?: FetchInit) => {
        return new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
      })
    );

    await expect(isQdrantReady(env, 5)).rejects.toBeDefined();
  });
});
