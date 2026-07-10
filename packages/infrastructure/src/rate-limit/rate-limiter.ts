export interface RateLimitInput {
  readonly key: string;
  readonly limit: number;
  readonly windowSeconds: number;
  readonly now: Date;
}

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly limit: number;
  readonly remaining: number;
  readonly resetAt: Date;
}

export interface RedisEvalClient {
  eval(
    script: string,
    options: { readonly keys: string[]; readonly arguments: string[] }
  ): Promise<unknown>;
}

const script = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]
local min = now - window
redis.call("ZREMRANGEBYSCORE", key, 0, min)
local count = redis.call("ZCARD", key)
if count >= limit then
  local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
  local reset = now + window
  if oldest[2] then
    reset = tonumber(oldest[2]) + window
  end
  redis.call("EXPIRE", key, window)
  return {0, limit - count, reset}
end
redis.call("ZADD", key, now, member)
redis.call("EXPIRE", key, window)
count = count + 1
local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
local reset = now + window
if oldest[2] then
  reset = tonumber(oldest[2]) + window
end
return {1, limit - count, reset}
`;

export class RedisRateLimiter {
  public constructor(
    private readonly redis: RedisEvalClient,
    private readonly keyPrefix: string
  ) {}

  public async check(input: RateLimitInput): Promise<RateLimitDecision> {
    if (
      input.key.trim().length === 0 ||
      !Number.isInteger(input.limit) ||
      input.limit <= 0 ||
      !Number.isInteger(input.windowSeconds) ||
      input.windowSeconds <= 0 ||
      !Number.isFinite(input.now.getTime())
    ) {
      throw new Error("Invalid rate-limit input.");
    }
    const nowSeconds = Math.floor(input.now.getTime() / 1000);
    const result = await this.redis.eval(script, {
      keys: [`${this.keyPrefix}:rate-limit:${input.key}`],
      arguments: [
        String(nowSeconds),
        String(input.windowSeconds),
        String(input.limit),
        `${nowSeconds}:${crypto.randomUUID()}`
      ]
    });

    const tuple = parseRateLimitResult(result);
    return {
      allowed: tuple.allowed,
      limit: input.limit,
      remaining: Math.max(0, tuple.remaining),
      resetAt: new Date(tuple.resetAtSeconds * 1000)
    };
  }
}

function parseRateLimitResult(value: unknown): {
  readonly allowed: boolean;
  readonly remaining: number;
  readonly resetAtSeconds: number;
} {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error("Unexpected Redis rate-limit response.");
  }

  const allowed = Number(value[0]);
  const remaining = Number(value[1]);
  const resetAtSeconds = Number(value[2]);
  if (
    !Number.isFinite(allowed) ||
    !Number.isFinite(remaining) ||
    !Number.isFinite(resetAtSeconds)
  ) {
    throw new Error("Redis rate-limit response contained non-numeric values.");
  }

  return {
    allowed: allowed === 1,
    remaining,
    resetAtSeconds
  };
}
