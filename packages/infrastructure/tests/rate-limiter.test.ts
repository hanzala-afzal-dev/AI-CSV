import { describe, expect, it } from "vitest";
import { RedisRateLimiter } from "../src";
import type { RedisEvalClient } from "../src";

class FakeRedisEvalClient implements RedisEvalClient {
  public readonly calls: Array<{
    readonly keys: readonly string[];
    readonly arguments: readonly string[];
  }> = [];

  public constructor(private readonly result: unknown) {}

  public async eval(
    _script: string,
    options: { readonly keys: readonly string[]; readonly arguments: readonly string[] }
  ): Promise<unknown> {
    this.calls.push(options);
    return this.result;
  }
}

describe("RedisRateLimiter", () => {
  it("returns allow metadata from the Redis script response", async () => {
    const redis = new FakeRedisEvalClient([1, 4, 1006]);
    const limiter = new RedisRateLimiter(redis, "agentic-csv");

    const decision = await limiter.check({
      key: "api:user_1",
      limit: 5,
      windowSeconds: 60,
      now: new Date(1000 * 1000)
    });

    expect(decision).toEqual({
      allowed: true,
      limit: 5,
      remaining: 4,
      resetAt: new Date(1006 * 1000)
    });
    expect(redis.calls[0]?.keys[0]).toBe("agentic-csv:rate-limit:api:user_1");
  });

  it("rejects unexpected Redis script responses", async () => {
    const limiter = new RedisRateLimiter(new FakeRedisEvalClient(["bad"]), "agentic-csv");

    await expect(
      limiter.check({
        key: "api:user_1",
        limit: 5,
        windowSeconds: 60,
        now: new Date()
      })
    ).rejects.toThrow("Unexpected Redis rate-limit response");
  });

  it("rejects invalid policy inputs before calling Redis", async () => {
    const redis = new FakeRedisEvalClient([1, 0, 1000]);
    const limiter = new RedisRateLimiter(redis, "agentic-csv");

    await expect(
      limiter.check({ key: "api:user_1", limit: 0, windowSeconds: 60, now: new Date() })
    ).rejects.toThrow("Invalid rate-limit input");
    expect(redis.calls).toHaveLength(0);
  });
});
