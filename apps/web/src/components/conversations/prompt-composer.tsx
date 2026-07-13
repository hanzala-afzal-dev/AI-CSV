"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ArrowUp, Paperclip, Square } from "lucide-react";
import type { AgentRunSummaryContract } from "@agentic-csv/contracts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip } from "@/components/ui/tooltip";

export function PromptComposer({
  value,
  onChange,
  onSubmit,
  onCancel,
  disabled,
  submitting,
  providerReady,
  run
}: {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly onCancel: () => void;
  readonly disabled: boolean;
  readonly submitting: boolean;
  readonly providerReady: boolean | null;
  readonly run: AgentRunSummaryContract | null;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 180)}px`;
  }, [value]);

  const canSubmit =
    !disabled && !submitting && !run && providerReady === true && value.trim().length > 0;
  return (
    <div className="composer-shell">
      {providerReady === false ? (
        <Alert className="mb-3 flex items-center justify-between gap-3 border-warning/30 bg-warning-soft text-warning-strong">
          <span>Connect a valid OpenAI key before starting a conversation.</span>
          <Link href="/settings/ai-provider" className="shrink-0 font-bold underline">
            Open settings
          </Link>
        </Alert>
      ) : null}
      <form
        className="prompt-composer"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSubmit) onSubmit();
        }}
      >
        <label htmlFor="conversation-prompt" className="sr-only">
          Message
        </label>
        <Textarea
          ref={textareaRef}
          id="conversation-prompt"
          value={value}
          maxLength={8_000}
          rows={1}
          placeholder="Ask about your data"
          disabled={disabled || submitting || Boolean(run) || providerReady !== true}
          className="min-h-12 max-h-[180px] border-0 px-3 py-3 shadow-none focus-visible:ring-0"
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              if (canSubmit) onSubmit();
            }
          }}
        />
        <div className="composer-actions">
          <Tooltip content="Attach CSV">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9"
              aria-label="Attach CSV"
              disabled
            >
              <Paperclip size={18} />
            </Button>
          </Tooltip>
          <div className="ml-auto flex items-center gap-2">
            {value.length >= 7_000 ? (
              <span className="text-xs text-muted">{value.length}/8000</span>
            ) : null}
            {run ? (
              <Tooltip content="Stop response">
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  className="size-9"
                  aria-label="Stop response"
                  onClick={onCancel}
                >
                  <Square size={14} fill="currentColor" />
                </Button>
              </Tooltip>
            ) : (
              <Tooltip content="Send message">
                <Button
                  type="submit"
                  size="icon"
                  className="size-9"
                  aria-label="Send message"
                  disabled={!canSubmit}
                >
                  <ArrowUp size={18} />
                </Button>
              </Tooltip>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
