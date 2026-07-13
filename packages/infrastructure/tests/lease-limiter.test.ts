import { describe, expect, it } from "vitest";
import { RedisLeaseLimiter, type RedisEvalClient } from "../src";

class FakeRedis implements RedisEvalClient {
  public readonly calls: Array<{
    readonly keys: readonly string[];
    readonly arguments: readonly string[];
  }> = [];

  public constructor(private readonly results: unknown[]) {}

  public async eval(
    _script: string,
    options: { readonly keys: readonly string[]; readonly arguments: readonly string[] }
  ) {
    this.calls.push(options);
    return this.results.shift();
  }
}

describe("RedisLeaseLimiter", () => {
  it("acquires and releases a prefixed concurrent stream lease", async () => {
    const redis = new FakeRedis([1, 1]);
    const limiter = new RedisLeaseLimiter(redis, "agentic-csv");

    await expect(
      limiter.acquire({
        key: "conversation:sse:user:alice",
        leaseId: "stream-1",
        limit: 3,
        ttlSeconds: 35,
        now: new Date("2026-07-13T12:00:00.000Z")
      })
    ).resolves.toBe(true);
    await limiter.release("conversation:sse:user:alice", "stream-1");

    expect(redis.calls[0]?.keys).toEqual([
      "agentic-csv:lease:conversation:sse:user:alice"
    ]);
    expect(redis.calls[0]?.arguments.slice(2)).toEqual(["3", "stream-1"]);
    expect(redis.calls[1]?.arguments).toEqual(["stream-1"]);
  });

  it("denies a lease when the concurrency limit is full", async () => {
    const limiter = new RedisLeaseLimiter(new FakeRedis([0]), "agentic-csv");
    await expect(
      limiter.acquire({
        key: "conversation:sse:user:alice",
        leaseId: "stream-4",
        limit: 3,
        ttlSeconds: 35,
        now: new Date()
      })
    ).resolves.toBe(false);
  });
});
