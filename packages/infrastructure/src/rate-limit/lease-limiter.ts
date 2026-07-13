import type { RedisEvalClient } from "./rate-limiter";

const acquireScript = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local expires = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
redis.call("ZREMRANGEBYSCORE", key, 0, now)
if redis.call("ZSCORE", key, member) then
  redis.call("ZADD", key, expires, member)
  redis.call("EXPIREAT", key, expires + 1)
  return 1
end
if redis.call("ZCARD", key) >= limit then
  return 0
end
redis.call("ZADD", key, expires, member)
redis.call("EXPIREAT", key, expires + 1)
return 1
`;

const releaseScript = `
return redis.call("ZREM", KEYS[1], ARGV[1])
`;

export class RedisLeaseLimiter {
  public constructor(
    private readonly redis: RedisEvalClient,
    private readonly keyPrefix: string
  ) {}

  public async acquire(input: {
    readonly key: string;
    readonly leaseId: string;
    readonly limit: number;
    readonly ttlSeconds: number;
    readonly now: Date;
  }): Promise<boolean> {
    validate(input);
    const now = Math.floor(input.now.getTime() / 1000);
    const result = await this.redis.eval(acquireScript, {
      keys: [this.redisKey(input.key)],
      arguments: [
        String(now),
        String(now + input.ttlSeconds),
        String(input.limit),
        input.leaseId
      ]
    });
    const numeric = Number(result);
    if (numeric !== 0 && numeric !== 1) {
      throw new Error("Unexpected Redis lease response.");
    }
    return numeric === 1;
  }

  public async release(key: string, leaseId: string): Promise<void> {
    if (!key.trim() || !leaseId.trim()) throw new Error("Invalid Redis lease input.");
    await this.redis.eval(releaseScript, {
      keys: [this.redisKey(key)],
      arguments: [leaseId]
    });
  }

  private redisKey(key: string): string {
    return `${this.keyPrefix}:lease:${key}`;
  }
}

function validate(input: {
  readonly key: string;
  readonly leaseId: string;
  readonly limit: number;
  readonly ttlSeconds: number;
  readonly now: Date;
}): void {
  if (
    !input.key.trim() ||
    !input.leaseId.trim() ||
    !Number.isInteger(input.limit) ||
    input.limit < 1 ||
    !Number.isInteger(input.ttlSeconds) ||
    input.ttlSeconds < 1 ||
    !Number.isFinite(input.now.getTime())
  ) {
    throw new Error("Invalid Redis lease input.");
  }
}
