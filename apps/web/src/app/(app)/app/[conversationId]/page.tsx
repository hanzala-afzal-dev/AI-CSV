import { ConversationWorkspace } from "@/components/conversations/conversation-workspace";

export default async function ConversationPage({
  params
}: {
  readonly params: Promise<{ readonly conversationId: string }>;
}) {
  return <ConversationWorkspace initialConversationId={(await params).conversationId} />;
}
