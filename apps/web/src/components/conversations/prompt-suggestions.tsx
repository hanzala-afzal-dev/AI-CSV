"use client";

import { Lightbulb } from "lucide-react";
import type { PromptSuggestionContract } from "@agentic-csv/contracts";

export function PromptSuggestions({
  suggestions,
  loading,
  disabled,
  onSelect
}: {
  readonly suggestions: readonly PromptSuggestionContract[];
  readonly loading: boolean;
  readonly disabled: boolean;
  readonly onSelect: (promptText: string) => void;
}) {
  if (!loading && suggestions.length === 0) return null;

  return (
    <section
      className="prompt-suggestion-region"
      aria-label="Suggested questions"
      aria-busy={loading}
    >
      <div className="prompt-suggestion-label">
        <Lightbulb size={14} aria-hidden="true" />
        <span>
          {suggestions[0]?.source === "follow_up_result" ? "Explore next" : "Try asking"}
        </span>
      </div>
      {loading ? (
        <span className="prompt-suggestion-loading" role="status">
          Loading suggestions
        </span>
      ) : (
        <div className="conversation-suggestions">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.id}
              type="button"
              disabled={disabled}
              onClick={() => onSelect(suggestion.promptText)}
            >
              {suggestion.displayText}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
