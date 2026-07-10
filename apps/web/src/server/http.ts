import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { DatasetWorkflowError } from "@agentic-csv/application";
import { DomainError } from "@agentic-csv/domain";
import { authenticateApiKey, type ApiPrincipal } from "@agentic-csv/infrastructure/auth";
import { ensureRedisConnected, getRuntime } from "./runtime";

export class HttpError extends Error {
  public constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly headers: Readonly<Record<string, string>> = {}
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export interface RequestContext {
  readonly correlationId: string;
  readonly principal: ApiPrincipal;
  readonly responseHeaders: Readonly<Record<string, string>>;
}

export async function authorizeMutation(
  request: Request,
  routeClass: "general" | "ai" = "general"
): Promise<RequestContext> {
  const runtime = getRuntime();
  validateMutationRequest(request, new URL(runtime.env.APP_URL).origin);
  const correlationId = readCorrelationId(request);
  try {
    await ensureRedisConnected();
  } catch {
    throw new HttpError(
      503,
      "RATE_LIMIT_UNAVAILABLE",
      "Request protection is temporarily unavailable."
    );
  }

  const authorization = request.headers.get("authorization");
  const credentialBucket = createHash("sha256")
    .update(authorization ?? "anonymous")
    .digest("hex")
    .slice(0, 24);
  const globalPreAuthDecision = await runtime.rateLimiter.check({
    key: "auth:global",
    limit: runtime.env.RATE_LIMIT_MAX_REQUESTS * 10,
    windowSeconds: runtime.env.RATE_LIMIT_WINDOW_SECONDS,
    now: new Date()
  });
  if (!globalPreAuthDecision.allowed) {
    throw rateLimitError(globalPreAuthDecision.resetAt);
  }
  const preAuthDecision = await runtime.rateLimiter.check({
    key: `auth:${credentialBucket}`,
    limit: Math.min(runtime.env.RATE_LIMIT_MAX_REQUESTS, 30),
    windowSeconds: runtime.env.RATE_LIMIT_WINDOW_SECONDS,
    now: new Date()
  });
  if (!preAuthDecision.allowed) {
    throw rateLimitError(preAuthDecision.resetAt);
  }

  const principal = await authenticateApiKey(
    runtime.database,
    authorization,
    runtime.env.AUTH_SECRET
  );
  if (!principal) {
    throw new HttpError(
      401,
      "AUTHENTICATION_REQUIRED",
      "A valid bearer API key is required.",
      {
        "www-authenticate": "Bearer"
      }
    );
  }

  const limit =
    routeClass === "ai"
      ? runtime.env.RATE_LIMIT_AI_MAX_REQUESTS
      : runtime.env.RATE_LIMIT_MAX_REQUESTS;
  const decision = await runtime.rateLimiter.check({
    key: `${routeClass}:user:${principal.userId}`,
    limit,
    windowSeconds: runtime.env.RATE_LIMIT_WINDOW_SECONDS,
    now: new Date()
  });
  const responseHeaders = {
    "x-ratelimit-limit": String(decision.limit),
    "x-ratelimit-remaining": String(decision.remaining),
    "x-ratelimit-reset": String(Math.ceil(decision.resetAt.getTime() / 1000))
  };
  if (!decision.allowed) {
    throw rateLimitError(decision.resetAt, responseHeaders);
  }

  return { correlationId, principal, responseHeaders };
}

export function requireIdempotencyKey(request: Request): string {
  const value = request.headers.get("idempotency-key")?.trim();
  if (
    !value ||
    value.length < 16 ||
    value.length > 200 ||
    !/^[A-Za-z0-9._-]+$/.test(value)
  ) {
    throw new HttpError(
      400,
      "IDEMPOTENCY_KEY_INVALID",
      "Idempotency-Key must contain 16 to 200 URL-safe characters."
    );
  }
  return value;
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new HttpError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
}

export function successResponse(
  data: unknown,
  context: RequestContext,
  status = 200
): NextResponse {
  return NextResponse.json(
    { ok: true, data, correlationId: context.correlationId },
    { status, headers: context.responseHeaders }
  );
}

export function errorResponse(
  error: unknown,
  correlationId = crypto.randomUUID()
): NextResponse {
  const runtime = getRuntime();
  const mapped = mapError(error);
  runtime.logger[mapped.status >= 500 ? "error" : "warn"](
    {
      correlationId,
      code: mapped.code,
      error: mapped.status >= 500 ? error : undefined
    },
    "API request failed"
  );
  return NextResponse.json(
    {
      error: {
        code: mapped.code,
        message: mapped.message,
        requestId: correlationId,
        details: {}
      }
    },
    { status: mapped.status, headers: mapped.headers }
  );
}

export function hashRequestBody(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function validateMutationRequest(request: Request, trustedOrigin: string): void {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (contentType !== "application/json") {
    throw new HttpError(
      415,
      "CONTENT_TYPE_UNSUPPORTED",
      "Content-Type must be application/json."
    );
  }
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    throw new HttpError(
      403,
      "CROSS_SITE_REQUEST_REJECTED",
      "Cross-site mutation rejected."
    );
  }
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  if (origin && origin !== trustedOrigin) {
    throw new HttpError(403, "ORIGIN_REJECTED", "Request origin is not trusted.");
  }
  if (!origin && referer) {
    let refererOrigin: string;
    try {
      refererOrigin = new URL(referer).origin;
    } catch {
      throw new HttpError(403, "REFERER_REJECTED", "Request referer is not trusted.");
    }
    if (refererOrigin !== trustedOrigin) {
      throw new HttpError(403, "REFERER_REJECTED", "Request referer is not trusted.");
    }
  }
}

function readCorrelationId(request: Request): string {
  const value = request.headers.get("x-correlation-id");
  return value && /^[0-9a-f-]{36}$/i.test(value) ? value : crypto.randomUUID();
}

function rateLimitError(
  resetAt: Date,
  headers: Readonly<Record<string, string>> = {}
): HttpError {
  const retryAfter = Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000));
  return new HttpError(429, "RATE_LIMIT_EXCEEDED", "Rate limit exceeded.", {
    ...headers,
    "retry-after": String(retryAfter)
  });
}

function mapError(error: unknown): {
  readonly status: number;
  readonly code: string;
  readonly message: string;
  readonly headers: Readonly<Record<string, string>>;
} {
  if (error instanceof HttpError) {
    return error;
  }
  if (error instanceof ZodError) {
    return {
      status: 422,
      code: "VALIDATION_FAILED",
      message: "Request validation failed.",
      headers: {}
    };
  }
  if (error instanceof DatasetWorkflowError) {
    const statusByCode: Record<string, number> = {
      DATASET_NOT_FOUND: 404,
      UPLOAD_INTENT_NOT_FOUND: 404,
      DATASET_UPLOAD_STATE_INVALID: 409,
      UPLOAD_TOO_LARGE: 413,
      UPLOAD_INTENT_EXPIRED: 410,
      UPLOAD_OBJECT_METADATA_MISMATCH: 422,
      IDEMPOTENCY_KEY_REUSED: 409,
      IDEMPOTENCY_REQUEST_IN_PROGRESS: 409
    };
    return {
      status: statusByCode[error.code] ?? 400,
      code: error.code,
      message: error.message,
      headers: {}
    };
  }
  if (error instanceof DomainError) {
    return { status: 422, code: error.code, message: error.message, headers: {} };
  }
  return {
    status: 500,
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred.",
    headers: {}
  };
}
