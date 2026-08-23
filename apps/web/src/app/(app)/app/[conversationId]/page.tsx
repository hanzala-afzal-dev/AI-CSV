import { ConversationWorkspace } from "@/components/conversations/conversation-workspace";

export default async function ConversationPage({
  params
}: {
  readonly params: Promise<{ readonly conversationId: string }>;
}) {
  const { conversationId } = await params;

  return (
    <ConversationWorkspace key={conversationId} initialConversationId={conversationId} />
  );
}
