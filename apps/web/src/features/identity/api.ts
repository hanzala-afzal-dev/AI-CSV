interface ApiErrorEnvelope {
  readonly error?: { readonly code?: string; readonly message?: string };
}

export class ClientApiError extends Error {
  public constructor(
    public readonly code: string,
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ClientApiError";
  }
}

export async function publicMutation<T>(path: string, body: unknown): Promise<T> {
  return request<T>(path, {
    method: "POST",
    body: JSON.stringify(body),
    headers: jsonHeaders()
  });
}

export async function authenticatedMutation<T>(
  path: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown
): Promise<T> {
  const csrf = await request<{ data: { csrfToken: string } }>("/api/v1/auth/csrf", {
    method: "GET"
  });
  return request<T>(path, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    headers: jsonHeaders(csrf.data.csrfToken)
  });
}

export async function authenticatedQuery<T>(path: string): Promise<T> {
  return request<T>(path, { method: "GET" });
}

async function request<T>(path: string, init: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, credentials: "same-origin" });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as ApiErrorEnvelope;
    throw new ClientApiError(
      payload.error?.code ?? "REQUEST_FAILED",
      payload.error?.message ?? "The request could not be completed.",
      response.status
    );
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function jsonHeaders(csrfToken?: string): HeadersInit {
  return {
    "content-type": "application/json",
    ...(csrfToken ? { "x-csrf-token": csrfToken } : {})
  };
}
