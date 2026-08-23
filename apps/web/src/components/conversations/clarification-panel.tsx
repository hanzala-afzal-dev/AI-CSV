"use client";

import { useState } from "react";
import { Check, CornerDownLeft } from "lucide-react";
import type { AgentRunSummaryContract } from "@agentic-csv/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Clarification = NonNullable<AgentRunSummaryContract["clarification"]>;

export function ClarificationPanel({
  clarification,
  busy,
  onSubmit
}: {
  readonly clarification: Clarification;
  readonly busy: boolean;
  readonly onSubmit: (answer: string, saveAsDatasetDefinition: boolean) => void;
}) {
  const [selected, setSelected] = useState("");
  const [customAnswer, setCustomAnswer] = useState("");
  const [remember, setRemember] = useState(false);

  const answer = selected || customAnswer.trim();
  const selectedOption = clarification.options.find(
    (option) => option.value === selected
  );
  return (
    <form
      className="mt-1 grid w-full max-w-xl gap-4 rounded-md border border-line bg-panel p-4 shadow-sm"
      aria-labelledby={`clarification-${clarification.id}`}
      onSubmit={(event) => {
        event.preventDefault();
        if (answer && !busy)
          onSubmit(answer, remember && Boolean(selectedOption?.columnId));
      }}
    >
      <div>
        <p className="text-xs font-bold uppercase text-action">Clarification needed</p>
        <p
          id={`clarification-${clarification.id}`}
          className="mt-1 text-sm font-semibold leading-6 text-ink"
        >
          {clarification.question}
        </p>
      </div>

      {clarification.options.length > 0 ? (
        <div className="grid gap-2" role="radiogroup" aria-label="Available choices">
          {clarification.options.map((option) => {
            const checked = selected === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={checked}
                disabled={busy}
                className="flex min-h-10 items-center gap-3 rounded-md border border-line px-3 py-2 text-left text-sm font-semibold text-ink outline-none transition-colors hover:bg-subtle focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-55"
                onClick={() => {
                  setSelected(option.value);
                  setCustomAnswer("");
                  if (!option.columnId) setRemember(false);
                }}
              >
                <span
                  className={`grid size-5 shrink-0 place-items-center rounded-full border ${checked ? "border-action bg-action text-white" : "border-line bg-panel"}`}
                  aria-hidden="true"
                >
                  {checked ? <Check size={13} /> : null}
                </span>
                <span className="min-w-0 break-words">{option.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="grid gap-2">
        <label
          htmlFor={`clarification-answer-${clarification.id}`}
          className="text-xs font-semibold text-muted"
        >
          {clarification.options.length > 0 ? "Or provide another answer" : "Your answer"}
        </label>
        <Input
          id={`clarification-answer-${clarification.id}`}
          value={customAnswer}
          maxLength={2_000}
          disabled={busy}
          placeholder="Type a precise answer"
          onChange={(event) => {
            setCustomAnswer(event.target.value);
            setSelected("");
            setRemember(false);
          }}
        />
      </div>

      {selectedOption?.columnId ? (
        <label className="flex items-start gap-3 text-sm font-medium text-ink">
          <input
            type="checkbox"
            checked={remember}
            disabled={busy}
            className="mt-0.5 size-4 rounded border-line accent-action"
            onChange={(event) => setRemember(event.target.checked)}
          />
          <span>Use this definition for future questions about this CSV</span>
        </label>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={!answer || busy}>
          <CornerDownLeft size={16} />
          {busy ? "Resuming" : "Continue analysis"}
        </Button>
      </div>
    </form>
  );
}
