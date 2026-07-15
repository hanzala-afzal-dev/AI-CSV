import { BarChart3, Columns3, Rows3 } from "lucide-react";
import type { DatasetProfileContract } from "@agentic-csv/contracts";

export function DatasetProfileSummary({
  profile,
  onSuggestion
}: {
  readonly profile: DatasetProfileContract;
  readonly onSuggestion: (suggestion: string) => void;
}) {
  return (
    <div className="dataset-profile-summary">
      <dl className="dataset-profile-metrics">
        <div>
          <Rows3 size={16} />
          <dt>Rows</dt>
          <dd>{profile.rowCount.toLocaleString()}</dd>
        </div>
        <div>
          <Columns3 size={16} />
          <dt>Columns</dt>
          <dd>{profile.columnCount.toLocaleString()}</dd>
        </div>
        <div>
          <BarChart3 size={16} />
          <dt>Format</dt>
          <dd>{delimiterLabel(profile.delimiter)}</dd>
        </div>
      </dl>

      <div className="dataset-column-list" aria-label="Detected CSV columns">
        {profile.columns.slice(0, 12).map((column) => (
          <span key={column.ordinal} title={column.originalName}>
            <strong>{column.originalName}</strong>
            <small>{column.inferredType}</small>
          </span>
        ))}
        {profile.columns.length > 12 ? (
          <span>
            <strong>{profile.columns.length - 12} more</strong>
            <small>columns</small>
          </span>
        ) : null}
      </div>

      {profile.warnings.length > 0 ? (
        <ul className="dataset-profile-warnings" aria-label="CSV profile warnings">
          {profile.warnings.map((warning) => (
            <li key={`${warning.code}:${warning.message}`}>{warning.message}</li>
          ))}
        </ul>
      ) : null}

      <div className="conversation-suggestions" aria-label="Dataset suggestions">
        {profile.suggestedPrompts.map((suggestion) => (
          <button key={suggestion} type="button" onClick={() => onSuggestion(suggestion)}>
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

function delimiterLabel(delimiter: DatasetProfileContract["delimiter"]): string {
  if (delimiter === "\t") return "Tab";
  if (delimiter === ",") return "Comma";
  if (delimiter === ";") return "Semicolon";
  return "Pipe";
}
