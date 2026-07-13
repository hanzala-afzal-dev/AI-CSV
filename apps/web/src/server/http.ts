import { createHash, createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  DatasetWorkflowError,
  ConversationError,
  IdentityError,
  ProviderError,
  type AuthenticatedSession
} from "@agentic-csv/application";
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
  readonly principal:
    ApiPrincipal | { readonly userId: string; readonly sessionId: string };
  readonly responseHeaders: Readonly<Record<string, string>>;
}

export interface BrowserRequestContext {
  readonly correlationId: string;
  readonly session: AuthenticatedSession;
  readonly sessionToken: string;
  readonly responseHeaders: Readonly<Record<string, string>>;
}

export const genericAcceptedMessage =
  "If the account can receive this request, an email will arrive shortly.";

export const genericRegistrationAcceptedMessage =
  "If this email is eligible for a new account, a verification email will arrive shortly.";

export function getSessionCookie(request: Request): string | null {
  const cookieName = getRuntime().env.SESSION_COOKIE_NAME;
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === cookieName) return decodeURIComponent(value.join("="));
  }
  return null;
}

export function setSessionCookie(response: NextResponse, sessionToken: string): void {
  const env = getRuntime().env;
  response.cookies.set(env.SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: env.SESSION_ABSOLUTE_TTL_SECONDS
  });
}

export function clearSessionCookie(response: NextResponse): void {
  const env = getRuntime().env;
  response.cookies.set(env.SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0
  });
}

export async function authenticateBrowserRequest(
  request: Request
): Promise<BrowserRequestContext> {
  const sessionToken = getSessionCookie(request);
  const session = sessionToken
    ? await getRuntime().identityService.authenticateSession(sessionToken)
    : null;
  if (!session || !sessionToken) {
    throw new HttpError(401, "AUTHENTICATION_REQUIRED", "Sign in is required.");
  }
  return {
    correlationId: readCorrelationId(request),
    session,
    sessionToken,
    responseHeaders: {}
  };
}

export async function authorizeBrowserMutation(
  request: Request
): Promise<BrowserRequestContext> {
  validateBrowserMutationRequest(request, new URL(getRuntime().env.APP_URL).origin);
  const context = await authenticateBrowserRequest(request);
  const csrfToken = request.headers.get("x-csrf-token");
  if (
    !csrfToken ||
    !getRuntime().identityService.verifyCsrf(context.session, csrfToken)
  ) {
    throw new HttpError(
      403,
      "CSRF_TOKEN_INVALID",
      "The security token is invalid or expired."
    );
  }
  const responseHeaders = await enforceRateLimit(
    `browser:user:${context.session.userId}`,
    getRuntime().env.RATE_LIMIT_MAX_REQUESTS
  );
  return { ...context, responseHeaders };
}

export async function protectPublicAuthRequest(
  request: Request,
  category: "login" | "register" | "recovery",
  identifier: string
): Promise<void> {
  validateBrowserMutationRequest(request, new URL(getRuntime().env.APP_URL).origin);
  const env = getRuntime().env;
  const limit =
    category === "recovery"
      ? env.RATE_LIMIT_RECOVERY_MAX_REQUESTS
      : env.RATE_LIMIT_LOGIN_MAX_REQUESTS;
  const ipBucket = hashPrivateValue(readClientAddress(request), env.AUTH_SECRET);
  const identifierBucket = hashPrivateValue(
    identifier.trim().normalize("NFKC").toLowerCase(),
    env.AUTH_SECRET
  );
  await enforceRateLimit(`auth:${category}:ip:${ipBucket}`, limit);
  await enforceRateLimit(`auth:${category}:identifier:${identifierBucket}`, limit);
}

export async function protectAuthenticatedLogin(userId: string): Promise<void> {
  await enforceRateLimit(
    `auth:login:account:${userId}`,
    getRuntime().env.RATE_LIMIT_LOGIN_MAX_REQUESTS
  );
}

export function protectProviderValidation(
  userId: string
): Promise<Readonly<Record<string, string>>> {
  return enforceRateLimit(
    `provider:openai:validation:user:${userId}`,
    getRuntime().env.RATE_LIMIT_CREDENTIAL_VALIDATION_MAX_REQUESTS
  );
}

export function protectConversationSubmission(
  userId: string
): Promise<Readonly<Record<string, string>>> {
  return enforceRateLimit(
    `conversation:submission:user:${userId}`,
    getRuntime().env.RATE_LIMIT_CHAT_SUBMISSION_MAX_REQUESTS
  );
}

export function protectConversationStream(
  userId: string
): Promise<Readonly<Record<string, string>>> {
  return enforceRateLimit(
    `conversation:sse:user:${userId}`,
    getRuntime().env.RATE_LIMIT_SSE_CONNECTION_MAX_REQUESTS
  );
}

export async function acquireConversationStreamLease(userId: string): Promise<{
  readonly leaseId: string;
  release(): Promise<void>;
}> {
  try {
    await ensureRedisConnected();
  } catch {
    throw new HttpError(
      503,
      "RATE_LIMIT_UNAVAILABLE",
      "Request protection is temporarily unavailable."
    );
  }
  const runtime = getRuntime();
  const key = `conversation:sse:user:${userId}`;
  const leaseId = crypto.randomUUID();
  const acquired = await runtime.leaseLimiter.acquire({
    key,
    leaseId,
    limit: runtime.env.SSE_MAX_CONNECTIONS_PER_USER,
    ttlSeconds: runtime.env.SSE_CONNECTION_LEASE_SECONDS,
    now: new Date()
  });
  if (!acquired) {
    throw new HttpError(
      429,
      "SSE_CONNECTION_LIMIT_EXCEEDED",
      "Too many conversation streams are already open."
    );
  }
  return {
    leaseId,
    release: () => runtime.leaseLimiter.release(key, leaseId)
  };
}

export function sessionMetadata(request: Request): {
  readonly userAgent: string | null;
  readonly ipHash: string | null;
} {
  const env = getRuntime().env;
  const address = readClientAddress(request);
  return {
    userAgent: request.headers.get("user-agent")?.slice(0, 255) ?? null,
    ipHash: address === "unknown" ? null : hashPrivateValue(address, env.AUTH_SECRET)
  };
}

export async function authorizeMutation(
  request: Request,
  routeClass: "general" | "ai" = "general"
): Promise<RequestContext> {
  const runtime = getRuntime();
  validateMutationRequest(request, new URL(runtime.env.APP_URL).origin);
  const correlationId = readCorrelationId(request);
  const browserToken = getSessionCookie(request);
  if (browserToken) {
    const browser = await authorizeBrowserMutation(request);
    return {
      correlationId: browser.correlationId,
      principal: { userId: browser.session.userId, sessionId: browser.session.id },
      responseHeaders: browser.responseHeaders
    };
  }
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
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > 65_536) {
      throw new HttpError(413, "REQUEST_BODY_TOO_LARGE", "Request body is too large.");
    }
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > 65_536) {
      throw new HttpError(413, "REQUEST_BODY_TOO_LARGE", "Request body is too large.");
    }
    return JSON.parse(text) as unknown;
  } catch (error) {
    if (error instanceof HttpError) throw error;
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
  correlationId = crypto.randomUUID(),
  options: { readonly sensitive?: boolean } = {}
): NextResponse {
  const runtime = getRuntime();
  const mapped = mapError(error);
  runtime.logger[mapped.status >= 500 ? "error" : "warn"](
    {
      correlationId,
      code: mapped.code,
      error:
        mapped.status >= 500
          ? serializeError(error, options.sensitive === true)
          : undefined
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

function serializeError(error: unknown, sensitive: boolean): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { name: "UnknownError" };
  }
  if (sensitive) {
    return {
      name: error.name,
      code: "code" in error && typeof error.code === "string" ? error.code : undefined
    };
  }
  return {
    name: error.name,
    message: error.message.slice(0, 500),
    stack: error.stack?.split("\n").slice(0, 12).join("\n"),
    code: "code" in error && typeof error.code === "string" ? error.code : undefined
  };
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

export function validateBrowserMutationRequest(
  request: Request,
  trustedOrigin: string
): void {
  validateMutationRequest(request, trustedOrigin);
  if (!request.headers.get("origin") && !request.headers.get("referer")) {
    throw new HttpError(403, "ORIGIN_REQUIRED", "A trusted request origin is required.");
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

async function enforceRateLimit(
  key: string,
  limit: number
): Promise<Readonly<Record<string, string>>> {
  try {
    await ensureRedisConnected();
  } catch {
    throw new HttpError(
      503,
      "RATE_LIMIT_UNAVAILABLE",
      "Request protection is temporarily unavailable."
    );
  }
  const env = getRuntime().env;
  const decision = await getRuntime().rateLimiter.check({
    key,
    limit,
    windowSeconds: env.RATE_LIMIT_WINDOW_SECONDS,
    now: new Date()
  });
  const headers = {
    "x-ratelimit-limit": String(decision.limit),
    "x-ratelimit-remaining": String(decision.remaining),
    "x-ratelimit-reset": String(Math.ceil(decision.resetAt.getTime() / 1000))
  };
  if (!decision.allowed) throw rateLimitError(decision.resetAt, headers);
  return headers;
}

function readClientAddress(request: Request): string {
  const env = getRuntime().env;
  if (!env.TRUST_PROXY) return "unknown";
  return (
    request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim() ||
    request.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

function hashPrivateValue(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex").slice(0, 32);
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
  if (error instanceof IdentityError) {
    const statusByCode: Record<string, number> = {
      AUTHENTICATION_FAILED: 401,
      AUTHENTICATION_REQUIRED: 401,
      CURRENT_PASSWORD_INVALID: 403,
      EMAIL_UNAVAILABLE: 409,
      SESSION_NOT_FOUND: 404,
      TOKEN_INVALID_OR_EXPIRED: 400
    };
    return {
      status: statusByCode[error.code] ?? 400,
      code: error.code,
      message: error.message,
      headers: {}
    };
  }
  if (error instanceof ProviderError) {
    const statusByCode: Record<string, number> = {
      PROVIDER_CREDENTIAL_NOT_CONFIGURED: 404,
      PROVIDER_KEY_INVALID: 422,
      PROVIDER_RATE_LIMITED: 429,
      PROVIDER_UNAVAILABLE: 503,
      PROVIDER_MODEL_UNAVAILABLE: 422,
      PROVIDER_REASONING_UNSUPPORTED: 422
    };
    return {
      status: statusByCode[error.code] ?? 400,
      code: error.code,
      message: error.message,
      headers: {}
    };
  }
  if (error instanceof ConversationError) {
    const statusByCode: Record<string, number> = {
      CONVERSATION_NOT_FOUND: 404,
      CONVERSATION_RUN_NOT_FOUND: 404,
      CONVERSATION_ARCHIVED: 409,
      CONVERSATION_CONFLICT: 409,
      CONVERSATION_RUN_ACTIVE: 409,
      CONVERSATION_REQUEST_ID_REUSED: 409
    };
    return {
      status: statusByCode[error.code] ?? 400,
      code: error.code,
      message: error.message,
      headers: {}
    };
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
