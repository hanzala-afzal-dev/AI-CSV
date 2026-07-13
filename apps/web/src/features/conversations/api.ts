import {
  agentRunSummarySchema,
  conversationDetailSchema,
  conversationListSchema,
  conversationSummarySchema,
  providerSettingsSchema,
  submitConversationMessageResponseSchema,
  type AgentRunSummaryContract,
  type ConversationDetailContract,
  type ConversationListContract,
  type ConversationSummaryContract,
  type ProviderSettingsContract,
  type SubmitConversationMessageResponse
} from "@agentic-csv/contracts";
import { authenticatedMutation, authenticatedQuery } from "@/features/identity/api";

interface Envelope<T> {
  readonly data: T;
}

export async function listConversations(
  view: "active" | "archived",
  cursor?: string
): Promise<ConversationListContract> {
  const query = new URLSearchParams({ view, limit: "30" });
  if (cursor) query.set("cursor", cursor);
  const response = await authenticatedQuery<Envelope<unknown>>(
    `/api/v1/conversations?${query}`
  );
  return conversationListSchema.parse(response.data);
}

export async function getConversation(
  conversationId: string
): Promise<ConversationDetailContract> {
  const response = await authenticatedQuery<Envelope<unknown>>(
    `/api/v1/conversations/${conversationId}`
  );
  return conversationDetailSchema.parse(response.data);
}

export async function createConversation(): Promise<ConversationSummaryContract> {
  const response = await authenticatedMutation<
    Envelope<{ readonly conversation: unknown }>
  >("/api/v1/conversations", "POST", {});
  return conversationSummarySchema.parse(response.data.conversation);
}

export async function renameConversation(
  conversationId: string,
  title: string
): Promise<ConversationSummaryContract> {
  const response = await authenticatedMutation<
    Envelope<{ readonly conversation: unknown }>
  >(`/api/v1/conversations/${conversationId}`, "PATCH", { title });
  return conversationSummarySchema.parse(response.data.conversation);
}

export async function setConversationArchived(
  conversationId: string,
  archived: boolean
): Promise<ConversationSummaryContract> {
  const response = await authenticatedMutation<
    Envelope<{ readonly conversation: unknown }>
  >(`/api/v1/conversations/${conversationId}/archive`, "POST", { archived });
  return conversationSummarySchema.parse(response.data.conversation);
}

export function deleteConversation(conversationId: string): Promise<void> {
  return authenticatedMutation<void>(`/api/v1/conversations/${conversationId}`, "DELETE");
}

export async function submitMessage(
  conversationId: string,
  content: string,
  clientRequestId: string
): Promise<SubmitConversationMessageResponse> {
  const response = await authenticatedMutation<Envelope<unknown>>(
    `/api/v1/conversations/${conversationId}/messages`,
    "POST",
    { clientRequestId, content }
  );
  return submitConversationMessageResponseSchema.parse(response.data);
}

export async function cancelRun(
  conversationId: string,
  runId: string
): Promise<AgentRunSummaryContract> {
  const response = await authenticatedMutation<Envelope<{ readonly run: unknown }>>(
    `/api/v1/conversations/${conversationId}/runs/${runId}/cancel`,
    "POST",
    {}
  );
  return agentRunSummarySchema.parse(response.data.run);
}

export async function getProviderSettings(): Promise<ProviderSettingsContract> {
  const response = await authenticatedQuery<Envelope<{ readonly settings: unknown }>>(
    "/api/v1/settings/providers/openai"
  );
  return providerSettingsSchema.parse(response.data.settings);
}
