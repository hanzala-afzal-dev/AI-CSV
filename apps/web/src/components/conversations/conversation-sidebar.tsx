"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Bot,
  DatabaseZap,
  MessageSquareText,
  Pencil,
  Plus,
  Search,
  UserRound,
  Trash2
} from "lucide-react";
import type { ConversationSummaryContract } from "@agentic-csv/contracts";
import { LogoutButton } from "@/components/layout/logout-button";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip } from "@/components/ui/tooltip";

export interface ConversationSidebarProps {
  readonly conversations: readonly ConversationSummaryContract[];
  readonly selectedId: string | null;
  readonly view: "active" | "archived";
  readonly loading: boolean;
  readonly creating: boolean;
  readonly nextCursor: string | null;
  readonly mobileOpen: boolean;
  readonly onMobileOpenChange: (open: boolean) => void;
  readonly onViewChange: (view: "active" | "archived") => void;
  readonly onCreate: () => void;
  readonly onOpen: (id: string) => void;
  readonly onRename: (conversation: ConversationSummaryContract) => void;
  readonly onArchive: (conversation: ConversationSummaryContract) => void;
  readonly onDelete: (conversation: ConversationSummaryContract) => void;
  readonly onLoadMore: () => void;
}

export function ConversationSidebar(props: ConversationSidebarProps) {
  return (
    <>
      <aside className="conversation-sidebar hidden lg:flex" aria-label="Conversations">
        <SidebarContent {...props} />
      </aside>
      <Dialog
        open={props.mobileOpen}
        onOpenChange={props.onMobileOpenChange}
        title="Conversations"
        className="h-[min(760px,calc(100dvh-2rem))] max-w-sm"
      >
        <div className="-m-5 h-[calc(100%-0px)] min-h-[560px]">
          <SidebarContent {...props} mobile />
        </div>
      </Dialog>
    </>
  );
}

function SidebarContent(props: ConversationSidebarProps & { readonly mobile?: boolean }) {
  const [search, setSearch] = useState("");
  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("en-US");
    return query
      ? props.conversations.filter((conversation) =>
          conversation.title.toLocaleLowerCase("en-US").includes(query)
        )
      : props.conversations;
  }, [props.conversations, search]);
  const groups = useMemo(() => groupConversations(visible), [visible]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="conversation-sidebar-toolbar">
        <Link href="/app" className="flex min-w-0 items-center gap-2.5 text-ink">
          <span className="grid size-9 shrink-0 place-items-center rounded-md bg-action text-white">
            <DatabaseZap size={18} />
          </span>
          <span className="truncate text-sm font-bold">Agentic CSV Analyst</span>
        </Link>
        <Tooltip content="New conversation">
          <Button
            type="button"
            size="icon"
            className="size-9"
            aria-label="New conversation"
            disabled={props.creating}
            onClick={props.onCreate}
          >
            <Plus size={18} />
          </Button>
        </Tooltip>
      </div>

      <div className="relative px-3 pb-3">
        <Search
          size={16}
          className="pointer-events-none absolute top-1/2 left-6 -translate-y-1/2 text-muted"
        />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search conversations"
          placeholder="Search conversations"
          className="h-9 pl-9"
        />
      </div>

      <div
        className="conversation-view-tabs"
        role="tablist"
        aria-label="Conversation view"
      >
        <button
          type="button"
          role="tab"
          aria-selected={props.view === "active"}
          onClick={() => props.onViewChange("active")}
        >
          <MessageSquareText size={15} />
          Recent
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={props.view === "archived"}
          onClick={() => props.onViewChange("archived")}
        >
          <Archive size={15} />
          Archive
        </button>
      </div>

      <div className="conversation-list" aria-busy={props.loading}>
        {props.loading && props.conversations.length === 0 ? (
          <SidebarSkeleton />
        ) : groups.length === 0 ? (
          <div className="conversation-list-empty">
            <MessageSquareText size={21} />
            <p>{search ? "No matching conversations" : "No conversations yet"}</p>
          </div>
        ) : (
          groups.map((group) => (
            <section key={group.label} aria-labelledby={`group-${slug(group.label)}`}>
              <h3 id={`group-${slug(group.label)}`}>{group.label}</h3>
              <div className="grid gap-1">
                {group.items.map((conversation) => (
                  <ConversationRow
                    key={conversation.id}
                    conversation={conversation}
                    selected={conversation.id === props.selectedId}
                    onOpen={() => {
                      props.onOpen(conversation.id);
                      if (props.mobile) props.onMobileOpenChange(false);
                    }}
                    onRename={() => props.onRename(conversation)}
                    onArchive={() => props.onArchive(conversation)}
                    onDelete={() => props.onDelete(conversation)}
                  />
                ))}
              </div>
            </section>
          ))
        )}
        {props.nextCursor && !search ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mx-2 mb-3"
            disabled={props.loading}
            onClick={props.onLoadMore}
          >
            Load older
          </Button>
        ) : null}
      </div>

      <div className="conversation-sidebar-footer">
        <Link href="/settings/ai-provider" className="conversation-sidebar-settings">
          <Bot size={16} />
          AI provider
        </Link>
        <Link href="/settings/profile" className="conversation-sidebar-settings">
          <UserRound size={16} />
          Account settings
        </Link>
        <LogoutButton className="conversation-sidebar-settings" />
      </div>
    </div>
  );
}

function ConversationRow({
  conversation,
  selected,
  onOpen,
  onRename,
  onArchive,
  onDelete
}: {
  readonly conversation: ConversationSummaryContract;
  readonly selected: boolean;
  readonly onOpen: () => void;
  readonly onRename: () => void;
  readonly onArchive: () => void;
  readonly onDelete: () => void;
}) {
  return (
    <div className="conversation-row" data-selected={selected || undefined}>
      <button type="button" className="conversation-row-main" onClick={onOpen}>
        <span className="truncate">{conversation.title}</span>
        <span>{formatListDate(conversation.lastActivityAt)}</span>
      </button>
      <div className="conversation-row-actions">
        <Tooltip content="Rename">
          <button type="button" aria-label="Rename conversation" onClick={onRename}>
            <Pencil size={14} />
          </button>
        </Tooltip>
        <Tooltip content={conversation.status === "archived" ? "Unarchive" : "Archive"}>
          <button
            type="button"
            aria-label={
              conversation.status === "archived"
                ? "Unarchive conversation"
                : "Archive conversation"
            }
            onClick={onArchive}
          >
            {conversation.status === "archived" ? (
              <ArchiveRestore size={14} />
            ) : (
              <Archive size={14} />
            )}
          </button>
        </Tooltip>
        <Tooltip content="Delete">
          <button
            type="button"
            aria-label="Delete conversation"
            className="hover:text-danger"
            onClick={onDelete}
          >
            <Trash2 size={14} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}

function SidebarSkeleton() {
  return (
    <div className="grid gap-3 px-3 py-4">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className="grid gap-2">
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-3 w-2/5" />
        </div>
      ))}
    </div>
  );
}

function groupConversations(conversations: readonly ConversationSummaryContract[]) {
  const groups = new Map<string, ConversationSummaryContract[]>();
  for (const conversation of conversations) {
    const label = dateGroup(conversation.lastActivityAt);
    const items = groups.get(label) ?? [];
    items.push(conversation);
    groups.set(label, items);
  }
  return [...groups].map(([label, items]) => ({ label, items }));
}

function dateGroup(value: string): string {
  const now = new Date();
  const date = new Date(value);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const target = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const days = Math.floor((today - target) / 86_400_000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "Previous 7 days";
  return "Older";
}

function formatListDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(
    new Date(value)
  );
}

function slug(value: string): string {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "-");
}
