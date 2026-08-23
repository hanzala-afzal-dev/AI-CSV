import { createHmac } from "node:crypto";
import {
  type MemoryRetrievalCache,
  type MemoryRetrievalInput
} from "@agentic-csv/application";
import {
  memoryRetrievalResultSchema,
  type MemoryRetrievalResultContract
} from "@agentic-csv/contracts";
import type { RedisClient } from "../redis/client";

export class RedisMemoryRetrievalCache implements MemoryRetrievalCache {
  public constructor(
    private readonly redis: RedisClient,
    private readonly prefix: string,
    private readonly hmacSecret: string,
    private readonly ttlSeconds: number,
    private readonly random: () => number = Math.random
  ) {}

  public async get(
    input: MemoryRetrievalInput & { readonly revision: number }
  ): Promise<MemoryRetrievalResultContract | null> {
    await this.connect();
    const stored = await this.redis.get(this.key(input));
    if (!stored) return null;
    const parsed = memoryRetrievalResultSchema.safeParse(JSON.parse(stored) as unknown);
    return parsed.success && parsed.data.revision === input.revision ? parsed.data : null;
  }

  public async set(
    input: MemoryRetrievalInput & { readonly revision: number },
    value: MemoryRetrievalResultContract
  ): Promise<void> {
    await this.connect();
    const jitter = Math.floor(this.ttlSeconds * 0.2 * this.random());
    await this.redis.set(this.key(input), JSON.stringify(value), {
      EX: this.ttlSeconds + jitter
    });
  }

  private key(input: MemoryRetrievalInput & { readonly revision: number }): string {
    const queryHash = createHmac("sha256", this.hmacSecret)
      .update(normalize(input.question))
      .digest("hex");
    return [
      this.prefix,
      "memory-context",
      "v1",
      input.userId,
      input.datasetVersionId,
      input.revision,
      queryHash
    ].join(":");
  }

  private async connect(): Promise<void> {
    if (!this.redis.isOpen) await this.redis.connect();
  }
}

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").trim();
}
