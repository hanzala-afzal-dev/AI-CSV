"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { MessageSquareText, Sparkles, UserRound } from "lucide-react";
import type {
  AgentRunSummaryContract,
  ConversationDetailContract,
  ConversationMessageContract
} from "@agentic-csv/contracts";
import { Skeleton } from "@/components/ui/skeleton";

export function MessageTimeline({
  detail,
  loading,
  streamedText,
  run,
  datasetPanel
}: {
  readonly detail: ConversationDetailContract | null;
  readonly loading: boolean;
  readonly streamedText: string;
  readonly run: AgentRunSummaryContract | null;
  readonly datasetPanel: ReactNode;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [detail?.messages.length, run?.status, streamedText]);

  if (loading) return <TimelineSkeleton />;
  if (!detail || detail.messages.length === 0) {
    return (
      <section className="conversation-empty" aria-labelledby="conversation-empty-title">
        <h2 id="conversation-empty-title" className="sr-only">
          CSV dataset
        </h2>
        {datasetPanel}
      </section>
    );
  }

  return (
    <div className="message-timeline">
      {datasetPanel}
      {detail.messages.map((message) => (
        <MessageItem key={message.id} message={message} />
      ))}
      {run ? (
        <div className="message-row message-row-assistant">
          <span className="message-avatar" aria-hidden="true">
            <Sparkles size={16} />
          </span>
          <div className="message-body">
            {streamedText ? (
              <p className="message-text">{streamedText}</p>
            ) : (
              <div className="streaming-indicator" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            )}
            <p className="sr-only" aria-live="polite">
              Assistant response {run.status}.
            </p>
          </div>
        </div>
      ) : null}
      <div ref={endRef} />
    </div>
  );
}

function MessageItem({ message }: { readonly message: ConversationMessageContract }) {
  if (message.role === "tool") return null;
  if (message.role === "system_event") {
    return (
      <div className="message-system-event">
        <MessageSquareText size={15} />
        {message.content.parts.map((part, index) => (
          <span key={index}>{part.text}</span>
        ))}
      </div>
    );
  }
  const user = message.role === "user";
  return (
    <article
      className={`message-row ${user ? "message-row-user" : "message-row-assistant"}`}
    >
      <span className="message-avatar" aria-hidden="true">
        {user ? <UserRound size={16} /> : <Sparkles size={16} />}
      </span>
      <div className="message-body">
        {message.content.parts.map((part, index) =>
          part.type === "warning" ? (
            <p key={index} className="message-warning">
              {part.text}
            </p>
          ) : (
            <p key={index} className="message-text">
              {part.text}
            </p>
          )
        )}
        <time dateTime={message.createdAt}>{formatMessageTime(message.createdAt)}</time>
      </div>
    </article>
  );
}

function TimelineSkeleton() {
  return (
    <div className="message-timeline" aria-label="Loading conversation">
      <div className="message-row message-row-assistant">
        <Skeleton className="size-8 shrink-0" />
        <div className="grid w-full gap-2">
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      </div>
      <div className="message-row message-row-user">
        <Skeleton className="size-8 shrink-0" />
        <Skeleton className="h-16 w-2/3" />
      </div>
    </div>
  );
}

function formatMessageTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}
