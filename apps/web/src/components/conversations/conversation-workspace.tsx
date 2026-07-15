"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Archive, ArchiveRestore, Database, Menu, Pencil, Trash2 } from "lucide-react";
import {
  runEventSchema,
  type AgentRunSummaryContract,
  type ConversationDetailContract,
  type ConversationSummaryContract,
  type DatasetDetailContract,
  type DatasetLimitsContract,
  type DatasetProfileContract
} from "@agentic-csv/contracts";
import { CsvDatasetPanel } from "@/components/datasets/csv-dataset-panel";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tooltip } from "@/components/ui/tooltip";
import { ClientApiError } from "@/features/identity/api";
import {
  completeUpload,
  createDataset,
  createUploadIntent,
  getDataset,
  getDatasetProfile,
  listDatasets,
  sha256Base64,
  uploadToSignedUrl
} from "@/features/datasets/api";
import {
  cancelRun,
  createConversation,
  deleteConversation,
  getConversation,
  getProviderSettings,
  listConversations,
  renameConversation,
  setConversationDataset,
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
  const [dataset, setDataset] = useState<DatasetDetailContract | null>(null);
  const [datasetProfile, setDatasetProfile] = useState<DatasetProfileContract | null>(
    null
  );
  const [datasetLimits, setDatasetLimits] = useState<DatasetLimitsContract | null>(null);
  const [activeDataset, setActiveDataset] = useState<{
    readonly datasetId: string;
    readonly datasetVersionId: string;
  } | null>(null);
  const [datasetBusy, setDatasetBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [datasetError, setDatasetError] = useState<string | null>(null);
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
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        setActiveDataset(next.conversation.activeDataset);
        if (next.conversation.status === "archived") setView("archived");
      } catch (cause) {
        setDetail(null);
        setRun(null);
        setActiveDataset(null);
        handleError(cause, "Conversation could not be loaded.");
      } finally {
        setDetailLoading(false);
      }
    },
    [handleError]
  );

  const loadDataset = useCallback(
    async (selection: {
      readonly datasetId: string;
      readonly datasetVersionId: string;
    }) => {
      try {
        const next = await getDataset(selection.datasetId);
        setDataset(next);
        const selected = next.versions.find(
          (version) => version.id === selection.datasetVersionId
        );
        if (selected?.status === "ready") {
          const result = await getDatasetProfile(
            selection.datasetId,
            selection.datasetVersionId
          );
          setDatasetProfile(result.profile);
        } else {
          setDatasetProfile(null);
        }
        setDatasetError(null);
      } catch (cause) {
        if (cause instanceof ClientApiError && cause.status === 409) {
          setDatasetProfile(null);
          return;
        }
        handleError(cause, "Dataset status could not be loaded.");
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
      setActiveDataset(null);
      setDataset(null);
      setDatasetProfile(null);
      setDetailLoading(false);
      return;
    }
    void loadDetail(initialConversationId);
  }, [initialConversationId, loadDetail]);

  useEffect(() => {
    if (!activeDataset) {
      setDataset(null);
      setDatasetProfile(null);
      return;
    }
    void loadDataset(activeDataset);
  }, [activeDataset, loadDataset]);

  useEffect(() => {
    if (!activeDataset || !dataset?.activeVersion) return;
    if (
      ![
        "pending_upload",
        "uploaded",
        "queued",
        "validating",
        "profiling",
        "indexing"
      ].includes(dataset.activeVersion.status)
    ) {
      return;
    }
    const timer = window.setTimeout(() => void loadDataset(activeDataset), 1500);
    return () => window.clearTimeout(timer);
  }, [activeDataset, dataset?.activeVersion, loadDataset]);

  useEffect(() => {
    let active = true;
    void listDatasets()
      .then((result) => {
        if (active) setDatasetLimits(result.limits);
      })
      .catch((cause) => {
        if (active) handleError(cause, "Upload limits could not be loaded.");
      });
    return () => {
      active = false;
    };
  }, [handleError]);

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

  const uploadCsv = async (file: File) => {
    const maxBytes = datasetLimits?.maxBytes ?? 100 * 1024 * 1024;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setDatasetError("Select a file with a .csv extension.");
      return;
    }
    if (file.size < 1) {
      setDatasetError("The selected CSV is empty.");
      return;
    }
    if (file.size > maxBytes) {
      setDatasetError(`The selected CSV exceeds the ${formatBytes(maxBytes)} limit.`);
      return;
    }

    setDatasetBusy(true);
    setDatasetError(null);
    setUploadProgress(0);
    try {
      const checksumSha256 = await sha256Base64(file);
      let conversationId = initialConversationId;
      if (!conversationId) {
        const conversation = await createConversation();
        conversationId = conversation.id;
        setConversations((current) => uniqueConversations([conversation, ...current]));
        router.push(`/app/${conversation.id}`);
      }

      const reusable =
        dataset && (dataset.status === "pending_upload" || dataset.status === "failed")
          ? dataset
          : null;
      const target = reusable ?? (await createDataset(file));
      const intent = await createUploadIntent(target.id, file, checksumSha256);
      const attached = await setConversationDataset(
        conversationId,
        intent.datasetVersionId
      );
      const selection = {
        datasetId: target.id,
        datasetVersionId: intent.datasetVersionId
      };
      setActiveDataset(selection);
      setConversations((current) =>
        current.map((conversation) =>
          conversation.id === attached.id ? attached : conversation
        )
      );
      setDetail((current) =>
        current?.conversation.id === attached.id
          ? { ...current, conversation: attached }
          : current
      );
      await loadDataset(selection);
      await uploadToSignedUrl(intent, file, setUploadProgress);
      await completeUpload(target.id, intent.uploadIntentId);
      setUploadProgress(null);
      await Promise.all([loadDataset(selection), loadList()]);
    } catch (cause) {
      if (cause instanceof ClientApiError && cause.status === 401) {
        router.replace("/login");
      } else {
        setDatasetError(
          cause instanceof Error ? cause.message : "The CSV could not be uploaded."
        );
      }
    } finally {
      setDatasetBusy(false);
      setUploadProgress(null);
    }
  };

  const send = async () => {
    const content = draft.trim();
    if (
      !content ||
      submitting ||
      run ||
      providerReady !== true ||
      dataset?.activeVersion?.status !== "ready" ||
      !datasetProfile
    ) {
      return;
    }
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
  const datasetReady =
    dataset?.activeVersion?.status === "ready" && datasetProfile !== null;
  const maxUploadBytes = datasetLimits?.maxBytes ?? 100 * 1024 * 1024;
  const datasetPanel = (
    <CsvDatasetPanel
      dataset={dataset}
      profile={datasetProfile}
      maxBytes={maxUploadBytes}
      uploadProgress={uploadProgress}
      busy={datasetBusy}
      error={datasetError}
      compact={Boolean(detail?.messages.length)}
      onChoose={() => fileInputRef.current?.click()}
      onFile={(file) => void uploadCsv(file)}
      onSuggestion={setDraft}
    />
  );
  return (
    <main className="conversation-workspace">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv,application/csv,text/plain"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const input = event.currentTarget;
          const file = input.files?.item(0);
          input.value = "";
          if (file) void uploadCsv(file);
        }}
      />
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
                {dataset
                  ? `${dataset.name} · ${datasetStatusLabel(dataset.activeVersion?.status)}`
                  : "No dataset"}
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
            datasetPanel={datasetPanel}
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
          datasetReady={datasetReady}
          attachmentDisabled={
            detailLoading || archived || actionBusy || datasetBusy || Boolean(run)
          }
          onAttach={() => fileInputRef.current?.click()}
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

function datasetStatusLabel(status: string | undefined): string {
  switch (status) {
    case "ready":
      return "Ready";
    case "failed":
      return "Needs attention";
    case "validating":
      return "Validating";
    case "profiling":
      return "Profiling";
    case "indexing":
      return "Saving profile";
    case "queued":
    case "uploaded":
      return "Queued";
    default:
      return "Uploading";
  }
}

function formatBytes(value: number): string {
  if (value >= 1024 ** 2) return `${Math.round(value / 1024 ** 2)} MB`;
  return `${Math.round(value / 1024)} KB`;
}
