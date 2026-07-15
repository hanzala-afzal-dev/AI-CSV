import { z } from "zod";
import {
  ProviderError,
  type AiProviderGateway,
  type CredentialValidationResult,
  type ProviderModel,
  type SecretValue
} from "@agentic-csv/application";
import type { ReasoningEffort } from "@agentic-csv/domain";

const modelListSchema = z.object({
  data: z
    .array(
      z.object({
        id: z.string().min(1).max(200)
      })
    )
    .max(10_000)
});

export interface OpenAiProviderGatewayConfig {
  readonly baseUrl: string;
  readonly timeoutMs: number;
  readonly fetch?: typeof fetch;
}

export class OpenAiProviderGateway implements AiProviderGateway {
  private readonly fetch: typeof fetch;
  private readonly modelsUrl: URL;

  public constructor(private readonly config: OpenAiProviderGatewayConfig) {
    this.fetch = config.fetch ?? fetch;
    this.modelsUrl = new URL("models", withTrailingSlash(config.baseUrl));
  }

  public async validateCredential(
    secret: SecretValue
  ): Promise<CredentialValidationResult> {
    return { models: await this.requestCompatibleModels(secret) };
  }

  public listCompatibleModels(secret: SecretValue): Promise<readonly ProviderModel[]> {
    return this.requestCompatibleModels(secret);
  }

  private async requestCompatibleModels(
    secret: SecretValue
  ): Promise<readonly ProviderModel[]> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      const response = await secret.use((apiKey) =>
        this.fetch(this.modelsUrl, {
          method: "GET",
          headers: {
            accept: "application/json",
            authorization: `Bearer ${apiKey}`
          },
          redirect: "error",
          signal: controller.signal
        })
      );
      if (!response.ok) throw providerResponseError(response.status);
      const declaredLength = Number(response.headers.get("content-length") ?? 0);
      if (Number.isFinite(declaredLength) && declaredLength > 2_000_000) {
        throw providerUnavailable();
      }
      const body = await response.text();
      if (body.length > 2_000_000) throw providerUnavailable();
      let payload: unknown;
      try {
        payload = JSON.parse(body) as unknown;
      } catch {
        throw providerUnavailable();
      }
      const parsed = modelListSchema.safeParse(payload);
      if (!parsed.success) throw providerUnavailable();
      return compatibleModels(parsed.data.data.map((model) => model.id));
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw providerUnavailable();
    } finally {
      clearTimeout(timeout);
    }
  }
}

interface CompatibilityRule {
  readonly pattern: RegExp;
  readonly reasoningEfforts: readonly ReasoningEffort[];
  readonly rank: number;
}

const compatibilityRules: readonly CompatibilityRule[] = [
  {
    pattern: /^gpt-5\.6(?:$|-(?:sol|terra|luna)(?:-|$)|-\d{4}-\d{2}-\d{2}$)/,
    reasoningEfforts: ["none", "low", "medium", "high", "xhigh", "max"],
    rank: 10
  },
  {
    pattern: /^gpt-5\.5-pro(?:$|-\d{4}-\d{2}-\d{2}$)/,
    reasoningEfforts: ["medium", "high", "xhigh"],
    rank: 20
  },
  {
    pattern: /^gpt-5\.5(?:$|-\d{4}-\d{2}-\d{2}$)/,
    reasoningEfforts: ["none", "low", "medium", "high", "xhigh"],
    rank: 21
  },
  {
    pattern: /^gpt-5\.4-pro(?:$|-\d{4}-\d{2}-\d{2}$)/,
    reasoningEfforts: ["medium", "high", "xhigh"],
    rank: 30
  },
  {
    pattern: /^gpt-5\.4(?:$|-(?:mini|nano)(?:-|$)|-\d{4}-\d{2}-\d{2}$)/,
    reasoningEfforts: ["none", "low", "medium", "high", "xhigh"],
    rank: 31
  },
  {
    pattern: /^gpt-5\.2(?:$|-\d{4}-\d{2}-\d{2}$)/,
    reasoningEfforts: ["none", "low", "medium", "high", "xhigh"],
    rank: 40
  },
  {
    pattern: /^gpt-5\.1(?:$|-\d{4}-\d{2}-\d{2}$)/,
    reasoningEfforts: ["none", "low", "medium", "high"],
    rank: 50
  },
  {
    pattern: /^gpt-5(?:$|-(?:mini|nano)(?:-|$)|-\d{4}-\d{2}-\d{2}$)/,
    reasoningEfforts: ["minimal", "low", "medium", "high"],
    rank: 60
  },
  {
    pattern: /^gpt-4\.1(?:$|-(?:mini|nano)(?:-|$)|-\d{4}-\d{2}-\d{2}$)/,
    reasoningEfforts: ["none"],
    rank: 70
  }
];

function compatibleModels(ids: readonly string[]): readonly ProviderModel[] {
  const unique = new Set(ids);
  return [...unique]
    .map((id) => {
      const rule = compatibilityRules.find((candidate) => candidate.pattern.test(id));
      return rule
        ? { id, reasoningEfforts: rule.reasoningEfforts, rank: rule.rank }
        : null;
    })
    .filter((model): model is ProviderModel & { readonly rank: number } => model !== null)
    .sort((left, right) => left.rank - right.rank || left.id.localeCompare(right.id))
    .map(({ id, reasoningEfforts }) => ({ id, reasoningEfforts }));
}

function providerResponseError(status: number): ProviderError {
  if (status === 401 || status === 403) {
    return new ProviderError(
      "PROVIDER_KEY_INVALID",
      "The OpenAI API key is invalid or lacks model-list permission."
    );
  }
  if (status === 429) {
    return new ProviderError(
      "PROVIDER_RATE_LIMITED",
      "OpenAI temporarily rate-limited credential validation."
    );
  }
  return providerUnavailable();
}

function providerUnavailable(): ProviderError {
  return new ProviderError(
    "PROVIDER_UNAVAILABLE",
    "OpenAI credential validation is temporarily unavailable."
  );
}

function withTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}
