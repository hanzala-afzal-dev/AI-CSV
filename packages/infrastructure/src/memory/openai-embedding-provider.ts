import { z } from "zod";
import {
  MemoryError,
  type CredentialCipher,
  type ProviderSettingsRepository,
  type UserTextEmbeddingProvider
} from "@agentic-csv/application";

const embeddingResponseSchema = z
  .object({
    data: z.array(
      z
        .object({
          index: z.number().int().nonnegative(),
          embedding: z.array(z.number().finite()).min(1).max(16_384)
        })
        .passthrough()
    )
  })
  .passthrough();

export interface OpenAiEmbeddingProviderConfig {
  readonly baseUrl: string;
  readonly modelId: string;
  readonly vectorSize: number;
  readonly timeoutMs: number;
  readonly maxInputCharacters: number;
  readonly fetch?: typeof fetch;
}

export class OpenAiEmbeddingProvider implements UserTextEmbeddingProvider {
  public readonly modelId: string;
  private readonly embeddingsUrl: URL;
  private readonly fetch: typeof fetch;

  public constructor(
    private readonly repository: ProviderSettingsRepository,
    private readonly cipher: CredentialCipher,
    private readonly config: OpenAiEmbeddingProviderConfig
  ) {
    this.modelId = config.modelId;
    this.embeddingsUrl = new URL("embeddings", withTrailingSlash(config.baseUrl));
    this.fetch = config.fetch ?? fetch;
  }

  public async embed(
    userId: string,
    texts: readonly string[]
  ): Promise<readonly (readonly number[])[]> {
    if (
      texts.length === 0 ||
      texts.some(
        (text) => text.trim().length === 0 || text.length > this.config.maxInputCharacters
      )
    ) {
      throw new MemoryError(
        "MEMORY_CONTEXT_INVALID",
        "Embedding input is empty or exceeds the configured bound."
      );
    }
    const credential = await this.repository.getEncryptedCredential(userId);
    if (!credential || credential.status !== "valid") {
      throw new MemoryError(
        "MEMORY_EMBEDDING_UNAVAILABLE",
        "A validated OpenAI credential is required for semantic memory."
      );
    }
    const secret = this.cipher.decrypt(credential, {
      credentialId: credential.id,
      userId,
      provider: credential.provider
    });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await secret.use((apiKey) =>
        this.fetch(this.embeddingsUrl, {
          method: "POST",
          headers: {
            accept: "application/json",
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json"
          },
          body: JSON.stringify({
            model: this.modelId,
            input: texts,
            dimensions: this.config.vectorSize,
            encoding_format: "float"
          }),
          redirect: "error",
          signal: controller.signal
        })
      );
      if (!response.ok) throw embeddingUnavailable();
      const declaredLength = Number(response.headers.get("content-length") ?? 0);
      if (Number.isFinite(declaredLength) && declaredLength > 16_000_000) {
        throw embeddingUnavailable();
      }
      const body = await response.text();
      if (body.length > 16_000_000) throw embeddingUnavailable();
      const parsed = embeddingResponseSchema.safeParse(JSON.parse(body) as unknown);
      if (!parsed.success || parsed.data.data.length !== texts.length) {
        throw embeddingUnavailable();
      }
      const ordered = [...parsed.data.data].sort(
        (left, right) => left.index - right.index
      );
      if (
        ordered.some(
          (item, index) =>
            item.index !== index || item.embedding.length !== this.config.vectorSize
        )
      ) {
        throw embeddingUnavailable();
      }
      return ordered.map((item) => item.embedding);
    } catch (error) {
      if (error instanceof MemoryError) throw error;
      throw embeddingUnavailable(error);
    } finally {
      clearTimeout(timeout);
      secret.destroy();
    }
  }
}

function embeddingUnavailable(cause?: unknown): MemoryError {
  return new MemoryError(
    "MEMORY_EMBEDDING_UNAVAILABLE",
    "OpenAI embeddings are temporarily unavailable.",
    cause === undefined ? undefined : { cause }
  );
}

function withTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
