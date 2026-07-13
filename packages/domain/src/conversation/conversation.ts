import { AggregateRoot } from "../shared/aggregate-root";
import { createDomainEvent } from "../shared/domain-event";
import { DomainError } from "../shared/domain-error";
import { createUuidV7 } from "../shared/uuid-v7";

export const conversationStatuses = ["active", "archived"] as const;
export type ConversationStatus = (typeof conversationStatuses)[number];

export const conversationMessageRoles = [
  "user",
  "assistant",
  "system_event",
  "tool"
] as const;
export type ConversationMessageRole = (typeof conversationMessageRoles)[number];

export const conversationMessageStatuses = ["streaming", "final", "failed"] as const;
export type ConversationMessageStatus = (typeof conversationMessageStatuses)[number];

export const agentRunStatuses = [
  "queued",
  "running",
  "waiting_for_user",
  "completed",
  "failed",
  "cancelled"
] as const;
export type AgentRunStatus = (typeof agentRunStatuses)[number];

export const activeAgentRunStatuses: readonly AgentRunStatus[] = [
  "queued",
  "running",
  "waiting_for_user"
];

export interface ConversationProps {
  readonly id: string;
  readonly userId: string;
  readonly title: string;
  readonly status: ConversationStatus;
  readonly lastMessageSequence: number;
  readonly lastActivityAt: Date;
  readonly version: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class Conversation extends AggregateRoot {
  public static readonly defaultTitle = "New conversation";

  private constructor(private props: ConversationProps) {
    super();
  }

  public static create(input: {
    readonly userId: string;
    readonly title?: string;
    readonly id?: string;
    readonly now?: Date;
  }): Conversation {
    const now = input.now ?? new Date();
    const conversation = new Conversation({
      id: input.id ?? createUuidV7(now.getTime()),
      userId: requireNonBlank(input.userId),
      title: normalizeConversationTitle(input.title ?? Conversation.defaultTitle),
      status: "active",
      lastMessageSequence: 0,
      lastActivityAt: now,
      version: 1,
      createdAt: now,
      updatedAt: now
    });
    conversation.record(
      createDomainEvent({
        aggregateId: conversation.id,
        name: "conversation.created",
        payload: { userId: conversation.userId, title: conversation.title },
        occurredAt: now
      })
    );
    return conversation;
  }

  public static rehydrate(props: ConversationProps): Conversation {
    if (!Number.isInteger(props.lastMessageSequence) || props.lastMessageSequence < 0) {
      throw new DomainError(
        "CONVERSATION_STATUS_TRANSITION_INVALID",
        "Conversation message sequence is invalid."
      );
    }
    if (!Number.isInteger(props.version) || props.version < 1) {
      throw new DomainError(
        "CONVERSATION_STATUS_TRANSITION_INVALID",
        "Conversation version is invalid."
      );
    }
    return new Conversation({
      ...props,
      id: requireNonBlank(props.id),
      userId: requireNonBlank(props.userId),
      title: normalizeConversationTitle(props.title)
    });
  }

  public get id(): string {
    return this.props.id;
  }

  public get userId(): string {
    return this.props.userId;
  }

  public get title(): string {
    return this.props.title;
  }

  public get status(): ConversationStatus {
    return this.props.status;
  }

  public rename(title: string, now = new Date()): void {
    const normalized = normalizeConversationTitle(title);
    if (normalized === this.title) return;
    this.props = {
      ...this.props,
      title: normalized,
      version: this.props.version + 1,
      updatedAt: now
    };
    this.record(
      createDomainEvent({
        aggregateId: this.id,
        name: "conversation.renamed",
        payload: { userId: this.userId, title: normalized },
        occurredAt: now
      })
    );
  }

  public setArchived(archived: boolean, now = new Date()): void {
    const nextStatus: ConversationStatus = archived ? "archived" : "active";
    if (nextStatus === this.status) return;
    this.props = {
      ...this.props,
      status: nextStatus,
      version: this.props.version + 1,
      updatedAt: now
    };
    this.record(
      createDomainEvent({
        aggregateId: this.id,
        name: archived ? "conversation.archived" : "conversation.unarchived",
        payload: { userId: this.userId },
        occurredAt: now
      })
    );
  }

  public toPrimitives(): ConversationProps {
    return { ...this.props };
  }
}

export function normalizeConversationTitle(value: string): string {
  const normalized = value.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (normalized.length < 1 || normalized.length > 120) {
    throw new DomainError(
      "CONVERSATION_TITLE_INVALID",
      "Conversation title must be between 1 and 120 characters."
    );
  }
  return normalized;
}

export function titleFromFirstMessage(content: string, maximumLength = 56): string {
  const normalized = content.normalize("NFKC").replace(/\s+/g, " ").trim();
  if (normalized.length <= maximumLength) {
    return normalizeConversationTitle(normalized || Conversation.defaultTitle);
  }
  const candidate = normalized.slice(0, maximumLength - 3);
  const boundary = candidate.lastIndexOf(" ");
  const shortened =
    boundary >= Math.floor(maximumLength / 2) ? candidate.slice(0, boundary) : candidate;
  return normalizeConversationTitle(`${shortened}...`);
}

export function isActiveAgentRunStatus(status: AgentRunStatus): boolean {
  return activeAgentRunStatuses.includes(status);
}

function requireNonBlank(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new DomainError(
      "CONVERSATION_STATUS_TRANSITION_INVALID",
      "Conversation identity is required."
    );
  }
  return normalized;
}
