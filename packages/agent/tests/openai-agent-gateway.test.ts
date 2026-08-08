import { describe, expect, it, vi } from "vitest";
import { SecretValue } from "@agentic-csv/application";
import { LangChainOpenAiAgentGateway } from "../src";

describe("LangChainOpenAiAgentGateway", () => {
  it("uses a bounded Responses API request and maps provider authentication failures", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { message: "invalid credential" } }), {
          status: 401,
          headers: { "content-type": "application/json" }
        })
      )
    );
    const gateway = new LangChainOpenAiAgentGateway({
      baseUrl: "https://api.openai.test/v1",
      timeoutMs: 5_000,
      fetch: fetchMock
    });
    const secret = SecretValue.create("sk-test-phase-seven");

    await expect(
      gateway.createPlan({
        secret,
        modelId: "gpt-5.5",
        reasoningEffort: "high",
        request: {
          question: "Total revenue",
          columns: [],
          clarification: null,
          validationErrors: []
        }
      })
    ).rejects.toMatchObject({ code: "AGENT_PROVIDER_AUTH_FAILED" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toContain("/responses");
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: "gpt-5.5",
      reasoning: { effort: "high" }
    });
    expect(body).not.toHaveProperty("temperature");
    expect(JSON.stringify(body)).not.toContain("sk-test-phase-seven");
    expect(JSON.stringify(body)).toContain("TRUSTED_CAPABILITIES");
    expect(JSON.stringify(body)).toContain("TRUSTED_PLAN_RULES");
    const schema = readRequestSchema(body);
    expect(strictSchemaViolations(schema)).toEqual([]);
  });

  it("returns a structurally valid draft so semantic plan failures can be repaired", async () => {
    const columnId = "11111111-1111-4111-8111-111111111111";
    const gateway = new LangChainOpenAiAgentGateway({
      baseUrl: "https://api.openai.test/v1",
      timeoutMs: 5_000,
      fetch: vi.fn<typeof fetch>(async () =>
        responsesApiSuccess({
          intent: "dataset_overview",
          plan: {
            version: 1,
            operation: "quality",
            dimensions: [],
            measures: [],
            filters: [],
            timeGrain: null,
            sort: [],
            limit: 100,
            visualizationPreference: "table",
            assumptions: []
          },
          requiresClarification: false,
          clarificationQuestion: null,
          clarificationOptions: [],
          assumptions: [],
          directResponse: null
        })
      )
    });

    const result = await gateway.createPlan({
      secret: SecretValue.create("sk-test-phase-seven"),
      modelId: "gpt-5.5",
      reasoningEffort: "medium",
      request: {
        question: "What is my CSV about?",
        columns: [
          {
            id: columnId,
            originalName: "Region",
            canonicalName: "region",
            inferredType: "text",
            semanticType: "categorical",
            nullable: false
          }
        ],
        clarification: null,
        validationErrors: []
      }
    });

    expect(result.plan).toMatchObject({ operation: "quality", measures: [] });
  });

  it("parses a strict planning response and normalizes nullable optional fields", async () => {
    const columnId = "11111111-1111-4111-8111-111111111111";
    const gateway = new LangChainOpenAiAgentGateway({
      baseUrl: "https://api.openai.test/v1",
      timeoutMs: 5_000,
      fetch: vi.fn<typeof fetch>(async () =>
        responsesApiSuccess({
          intent: "aggregation",
          plan: {
            version: 1,
            operation: "aggregate",
            dimensions: [],
            measures: [{ columnId, aggregation: "sum" }],
            filters: [],
            timeGrain: null,
            sort: [],
            limit: 100,
            visualizationPreference: "bar",
            assumptions: []
          },
          requiresClarification: false,
          clarificationQuestion: null,
          clarificationOptions: [],
          assumptions: [],
          directResponse: null
        })
      )
    });

    const result = await gateway.createPlan({
      secret: SecretValue.create("sk-test-phase-seven"),
      modelId: "gpt-5.5",
      reasoningEffort: "high",
      request: {
        question: "Build a revenue chart",
        columns: [
          {
            id: columnId,
            originalName: "Revenue",
            canonicalName: "revenue",
            inferredType: "decimal",
            semanticType: "numeric",
            nullable: false
          }
        ],
        clarification: null,
        validationErrors: []
      }
    });

    expect(result.plan).toMatchObject({
      operation: "aggregate",
      visualizationPreference: "bar"
    });
    expect(result.plan).not.toHaveProperty("timeGrain");
  });

  it("reports safe diagnostics and distinguishes rejected requests from bad output", async () => {
    const onProviderError = vi.fn();
    const gateway = new LangChainOpenAiAgentGateway({
      baseUrl: "https://api.openai.test/v1",
      timeoutMs: 5_000,
      onProviderError,
      fetch: vi.fn<typeof fetch>(async () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              error: {
                message: "Invalid schema for response_format",
                type: "invalid_request_error",
                param: "text.format.schema",
                code: "invalid_json_schema"
              }
            }),
            { status: 400, headers: { "content-type": "application/json" } }
          )
        )
      )
    });

    await expect(
      gateway.createPlan({
        secret: SecretValue.create("sk-test-phase-seven"),
        modelId: "gpt-5.5",
        reasoningEffort: "high",
        request: {
          question: "Total revenue",
          columns: [],
          clarification: null,
          validationErrors: []
        }
      })
    ).rejects.toMatchObject({
      code: "AGENT_PROVIDER_CONFIGURATION_INVALID",
      retryable: false
    });
    expect(onProviderError).toHaveBeenCalledWith({
      operation: "planning",
      errorName: expect.any(String),
      status: 400,
      providerCode: "invalid_json_schema",
      providerType: "invalid_request_error",
      providerParam: "text.format.schema",
      validationIssues: []
    });
  });
});

function readRequestSchema(body: Record<string, unknown>): unknown {
  const text = asRecord(body.text);
  const format = asRecord(text.format);
  return format.schema;
}

function strictSchemaViolations(value: unknown, path = "$"): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) =>
      strictSchemaViolations(item, `${path}[${index}]`)
    );
  }
  if (!isRecord(value)) return [];

  const violations: string[] = [];
  if (value.type === "object" && isRecord(value.properties)) {
    const required = new Set(
      Array.isArray(value.required)
        ? value.required.filter((item): item is string => typeof item === "string")
        : []
    );
    for (const property of Object.keys(value.properties)) {
      if (!required.has(property)) violations.push(`${path}.${property} is optional`);
    }
    if (value.additionalProperties !== false) {
      violations.push(`${path} allows additional properties`);
    }
  }

  for (const [key, child] of Object.entries(value)) {
    violations.push(...strictSchemaViolations(child, `${path}.${key}`));
  }
  return violations;
}

function responsesApiSuccess(parsed: unknown): Response {
  return new Response(
    JSON.stringify({
      id: "resp_test",
      object: "response",
      created_at: 1_785_959_000,
      status: "completed",
      error: null,
      incomplete_details: null,
      instructions: null,
      max_output_tokens: null,
      model: "gpt-5.5",
      output: [
        {
          id: "msg_test",
          type: "message",
          status: "completed",
          role: "assistant",
          content: [
            {
              type: "output_text",
              text: JSON.stringify(parsed),
              annotations: [],
              logprobs: []
            }
          ]
        }
      ],
      parallel_tool_calls: true,
      previous_response_id: null,
      reasoning: { effort: "high", summary: null },
      store: false,
      temperature: null,
      text: { format: { type: "json_schema" }, verbosity: "medium" },
      tool_choice: "auto",
      tools: [],
      top_p: null,
      truncation: "disabled",
      usage: {
        input_tokens: 10,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 10,
        output_tokens_details: { reasoning_tokens: 0 },
        total_tokens: 20
      },
      user: null,
      metadata: {}
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw new Error("Expected an object.");
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
