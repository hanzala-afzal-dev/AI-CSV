"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, ArchiveRestore, Database, Menu, Pencil, Trash2 } from "lucide-react";
import {
  runEventSchema,
  type AgentRunSummaryContract,
  type ConversationDetailContract,
  type ConversationSummaryContract
} from "@agentic-csv/contracts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip } from "@/components/ui/tooltip";
import { ClientApiError } from "@/features/identity/api";
import {
  cancelRun,
  createConversation,
  deleteConversation,
  getConversation,
  getProviderSettings,
  listConversations,
  renameConversation,
  setConversationArchived,
  submitMessage
} from "@/features/conversations/api";
import { ConversationSidebar } from "./conversation-sidebar";
import { MessageTimeline } from "./message-timeline";
import { PromptComposer } from "./prompt-composer";

export function ConversationWorkspace({
  initialConversationId
}: {
  readonly initialConversationId: string | null;
}) {
  const router = useRouter();
  const [view, setView] = useState<"active" | "archived">("active");
  const [conversations, setConversations] = useState<ConversationSummaryContract[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [detail, setDetail] = useState<ConversationDetailContract | null>(null);
  const [detailLoading, setDetailLoading] = useState(Boolean(initialConversationId));
  const [providerReady, setProviderReady] = useState<boolean | null>(null);
  const [draft, setDraft] = useState("");
  const [run, setRun] = useState<AgentRunSummaryContract | null>(null);
  const [streamedText, setStreamedText] = useState("");
  const [creating, setCreating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<ConversationSummaryContract | null>(
    null
  );
  const [renameValue, setRenameValue] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<ConversationSummaryContract | null>(
    null
  );
  const lastEventSequences = useRef(new Map<string, number>());

  const handleError = useCallback(
    (cause: unknown, fallback: string) => {
      if (cause instanceof ClientApiError && cause.status === 401) {
        router.replace("/login");
        return;
      }
      setError(cause instanceof Error ? cause.message : fallback);
    },
    [router]
  );

  const loadList = useCallback(
    async (cursor?: string) => {
      const append = cursor !== undefined;
      setListLoading(true);
      try {
        const page = await listConversations(view, cursor);
        setConversations((current) =>
          append
            ? uniqueConversations([...current, ...page.conversations])
            : page.conversations
        );
        setNextCursor(page.nextCursor);
      } catch (cause) {
        handleError(cause, "Conversations could not be loaded.");
      } finally {
        setListLoading(false);
      }
    },
    [handleError, view]
  );

  const loadDetail = useCallback(
    async (conversationId: string) => {
      setDetailLoading(true);
      try {
        const next = await getConversation(conversationId);
        setDetail(next);
        setRun(next.activeRun);
        if (next.conversation.status === "archived") setView("archived");
      } catch (cause) {
        setDetail(null);
        setRun(null);
        handleError(cause, "Conversation could not be loaded.");
      } finally {
        setDetailLoading(false);
      }
    },
    [handleError]
  );

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    setRunError(null);
    setStreamedText("");
    if (!initialConversationId) {
      setDetail(null);
      setRun(null);
      setDetailLoading(false);
      return;
    }
    void loadDetail(initialConversationId);
  }, [initialConversationId, loadDetail]);

  useEffect(() => {
    let active = true;
    void getProviderSettings()
      .then((settings) => {
        if (active) {
          setProviderReady(
            settings.credential.configured &&
              settings.credential.status === "valid" &&
              settings.preference !== null
          );
        }
      })
      .catch((cause) => {
        if (!active) return;
        setProviderReady(false);
        handleError(cause, "Provider settings could not be loaded.");
      });
    return () => {
      active = false;
    };
  }, [handleError]);

  const refreshAfterRun = useCallback(
    async (conversationId: string) => {
      await Promise.all([loadDetail(conversationId), loadList()]);
      setStreamedText("");
    },
    [loadDetail, loadList]
  );

  useEffect(() => {
    if (!run) return;
    const lastSequence = lastEventSequences.current.get(run.id) ?? 0;
    const separator = run.eventsUrl.includes("?") ? "&" : "?";
    const source = new EventSource(`${run.eventsUrl}${separator}after=${lastSequence}`);
    let terminal = false;
    const handleEvent = (raw: Event) => {
      if (!(raw instanceof MessageEvent) || typeof raw.data !== "string") return;
      let decoded: unknown;
      try {
        decoded = JSON.parse(raw.data);
      } catch {
        setRunError("The response stream returned invalid data.");
        source.close();
        return;
      }
      const parsed = runEventSchema.safeParse(decoded);
      if (!parsed.success) {
        setRunError("The response stream returned invalid data.");
        source.close();
        return;
      }
      const event = parsed.data;
      const seen = lastEventSequences.current.get(run.id) ?? 0;
      if (event.sequence <= seen) return;
      lastEventSequences.current.set(run.id, event.sequence);
      if (event.type === "run.started") {
        setRun((current) => (current ? { ...current, status: "running" } : current));
      } else if (event.type === "assistant.delta") {
        setStreamedText((current) => current + event.payload.text);
      } else if (event.type === "run.failed") {
        terminal = true;
        setRunError(event.payload.message);
      } else if (event.type === "run.completed" || event.type === "run.cancelled") {
        terminal = true;
      }
      if (terminal) {
        source.close();
        void refreshAfterRun(run.conversationId);
      }
    };
    const eventTypes = [
      "run.queued",
      "run.started",
      "assistant.delta",
      "run.completed",
      "run.failed",
      "run.cancelled"
    ];
    for (const type of eventTypes) source.addEventListener(type, handleEvent);
    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED && !terminal) {
        setRunError("The response stream disconnected. Refresh to reconnect.");
      }
    };
    return () => source.close();
  }, [refreshAfterRun, run?.conversationId, run?.eventsUrl, run?.id]);

  const createNewConversation = async () => {
    setCreating(true);
    setError(null);
    try {
      const conversation = await createConversation();
      setView("active");
      setConversations((current) => uniqueConversations([conversation, ...current]));
      router.push(`/app/${conversation.id}`);
    } catch (cause) {
      handleError(cause, "Conversation could not be created.");
    } finally {
      setCreating(false);
    }
  };

  const send = async () => {
    const content = draft.trim();
    if (!content || submitting || run || providerReady !== true) return;
    setSubmitting(true);
    setError(null);
    setRunError(null);
    try {
      let conversationId = initialConversationId;
      if (!conversationId) {
        const conversation = await createConversation();
        conversationId = conversation.id;
        setConversations((current) => uniqueConversations([conversation, ...current]));
        router.push(`/app/${conversation.id}`);
      }
      const submission = await submitMessage(
        conversationId,
        content,
        crypto.randomUUID()
      );
      const now = new Date().toISOString();
      setDraft("");
      setStreamedText("");
      setRun({
        id: submission.runId,
        conversationId,
        userMessageId: submission.messageId,
        status: "queued",
        eventsUrl: submission.eventsUrl,
        failureCode: null,
        failureMessage: null,
        createdAt: now,
        updatedAt: now
      });
      await loadDetail(conversationId);
      await loadList();
    } catch (cause) {
      handleError(cause, "Message could not be sent.");
    } finally {
      setSubmitting(false);
    }
  };

  const stopRun = async () => {
    if (!run) return;
    setActionBusy(true);
    try {
      await cancelRun(run.conversationId, run.id);
      await refreshAfterRun(run.conversationId);
    } catch (cause) {
      handleError(cause, "The response could not be stopped.");
    } finally {
      setActionBusy(false);
    }
  };

  const archive = async (conversation: ConversationSummaryContract) => {
    setActionBusy(true);
    setError(null);
    try {
      await setConversationArchived(conversation.id, conversation.status !== "archived");
      if (conversation.id === initialConversationId) router.push("/app");
      await loadList();
    } catch (cause) {
      handleError(cause, "Conversation could not be updated.");
    } finally {
      setActionBusy(false);
    }
  };

  const saveRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    setActionBusy(true);
    setError(null);
    try {
      const renamed = await renameConversation(renameTarget.id, renameValue);
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === renamed.id ? renamed : conversation
        )
      );
      if (detail?.conversation.id === renamed.id) {
        setDetail({ ...detail, conversation: renamed });
      }
      setRenameTarget(null);
    } catch (cause) {
      handleError(cause, "Conversation could not be renamed.");
    } finally {
      setActionBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setActionBusy(true);
    setError(null);
    try {
      await deleteConversation(deleteTarget.id);
      setConversations((current) =>
        current.filter((conversation) => conversation.id !== deleteTarget.id)
      );
      if (deleteTarget.id === initialConversationId) router.push("/app");
      setDeleteTarget(null);
    } catch (cause) {
      handleError(cause, "Conversation could not be deleted.");
    } finally {
      setActionBusy(false);
    }
  };

  const current = detail?.conversation ?? null;
  const archived = current?.status === "archived";
  return (
    <main className="conversation-workspace">
      <ConversationSidebar
        conversations={conversations}
        selectedId={initialConversationId}
        view={view}
        loading={listLoading}
        creating={creating}
        nextCursor={nextCursor}
        mobileOpen={mobileOpen}
        onMobileOpenChange={setMobileOpen}
        onViewChange={(next) => {
          setView(next);
          if (initialConversationId) router.push("/app");
        }}
        onCreate={() => void createNewConversation()}
        onOpen={(id) => router.push(`/app/${id}`)}
        onRename={(conversation) => {
          setRenameTarget(conversation);
          setRenameValue(conversation.title);
        }}
        onArchive={(conversation) => void archive(conversation)}
        onDelete={setDeleteTarget}
        onLoadMore={() => {
          if (nextCursor) void loadList(nextCursor);
        }}
      />

      <section className="conversation-main">
        <header className="conversation-header">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 lg:hidden"
            aria-label="Open conversations"
            onClick={() => setMobileOpen(true)}
          >
            <Menu size={19} />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate">{current?.title ?? "New conversation"}</h1>
            <div className="conversation-header-meta">
              <span>
                <Database size={13} />
                No dataset
              </span>
              {archived ? <span>Archived</span> : null}
            </div>
          </div>
          {current ? (
            <div className="flex items-center gap-1">
              <Tooltip content="Rename">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9"
                  aria-label="Rename conversation"
                  onClick={() => {
                    setRenameTarget(current);
                    setRenameValue(current.title);
                  }}
                >
                  <Pencil size={17} />
                </Button>
              </Tooltip>
              <Tooltip content={archived ? "Unarchive" : "Archive"}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9"
                  aria-label={
                    archived ? "Unarchive conversation" : "Archive conversation"
                  }
                  disabled={actionBusy}
                  onClick={() => void archive(current)}
                >
                  {archived ? <ArchiveRestore size={17} /> : <Archive size={17} />}
                </Button>
              </Tooltip>
            </div>
          ) : null}
        </header>

        {error ? (
          <Alert className="conversation-alert border-danger/25 bg-danger-soft text-danger-strong">
            <span>{error}</span>
            <button
              type="button"
              className="font-bold underline"
              onClick={() => setError(null)}
            >
              Dismiss
            </button>
          </Alert>
        ) : null}
        {runError ? (
          <Alert className="conversation-alert border-warning/30 bg-warning-soft text-warning-strong">
            <span>{runError}</span>
            <button
              type="button"
              className="font-bold underline"
              onClick={() => setRunError(null)}
            >
              Dismiss
            </button>
          </Alert>
        ) : null}
        {archived ? (
          <Alert className="conversation-alert">
            <span>This conversation is archived.</span>
            <button
              type="button"
              className="font-bold underline"
              onClick={() => void archive(current)}
            >
              Unarchive
            </button>
          </Alert>
        ) : null}

        <div className="conversation-scroll-region">
          <MessageTimeline
            detail={detail}
            loading={detailLoading}
            streamedText={streamedText}
            run={run}
            onSuggestion={setDraft}
          />
        </div>
        <PromptComposer
          value={draft}
          onChange={setDraft}
          onSubmit={() => void send()}
          onCancel={() => void stopRun()}
          disabled={detailLoading || archived || actionBusy}
          submitting={submitting}
          providerReady={providerReady}
          run={run}
        />
      </section>

      <Dialog
        open={renameTarget !== null}
        onOpenChange={(open) => {
          if (!open && !actionBusy) setRenameTarget(null);
        }}
        title="Rename conversation"
        description="Use a concise title that will be easy to find later."
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={actionBusy}
              onClick={() => setRenameTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={actionBusy || !renameValue.trim()}
              onClick={() => void saveRename()}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="grid gap-2">
          <Label htmlFor="conversation-title">Title</Label>
          <Input
            id="conversation-title"
            value={renameValue}
            maxLength={120}
            autoFocus
            onChange={(event) => setRenameValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void saveRename();
              }
            }}
          />
        </div>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !actionBusy) setDeleteTarget(null);
        }}
        title="Delete conversation"
        description="Messages, run history, and stored events in this conversation will be permanently deleted."
        footer={
          <>
            <Button
              type="button"
              variant="secondary"
              disabled={actionBusy}
              onClick={() => setDeleteTarget(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              disabled={actionBusy}
              onClick={() => void confirmDelete()}
            >
              <Trash2 size={16} />
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm leading-6 text-muted">
          {deleteTarget ? `"${deleteTarget.title}" will not be recoverable.` : null}
        </p>
      </Dialog>
    </main>
  );
}

function uniqueConversations(values: readonly ConversationSummaryContract[]) {
  return [
    ...new Map(values.map((conversation) => [conversation.id, conversation])).values()
  ];
}
