"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BarChart3,
  ChartLine,
  DatabaseZap,
  PieChart,
  RefreshCw,
  ScatterChart,
  Table2
} from "lucide-react";
import type {
  AnalysisArtifactBundleContract,
  AnalysisResultArtifactContract,
  AnalysisResultRowContract,
  ChartSpecContract
} from "@agentic-csv/contracts";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getAnalysisResult } from "@/features/conversations/api";

const chartColors = ["#177d65", "#3b6cb7", "#c48022", "#9a4b71", "#61707d"];

export function AnalysisArtifact({
  resultId,
  chartArtifactId
}: {
  readonly resultId: string;
  readonly chartArtifactId: string;
}) {
  const [artifact, setArtifact] = useState<AnalysisArtifactBundleContract | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await getAnalysisResult(resultId);
      if (next.chart.id !== chartArtifactId) {
        throw new Error("The chart reference does not match this result.");
      }
      setArtifact(next);
    } catch (cause) {
      setArtifact(null);
      setError(
        cause instanceof Error ? cause.message : "Analysis result could not be loaded."
      );
    } finally {
      setLoading(false);
    }
  }, [chartArtifactId, resultId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <AnalysisSkeleton />;
  if (error || !artifact) {
    return (
      <Alert className="analysis-artifact-error border-danger/25 bg-danger-soft text-danger-strong">
        <span>{error ?? "Analysis result could not be loaded."}</span>
        <Button type="button" variant="secondary" size="sm" onClick={() => void load()}>
          <RefreshCw size={14} />
          Retry
        </Button>
      </Alert>
    );
  }

  return (
    <section className="analysis-artifact" aria-labelledby={`analysis-${resultId}`}>
      <header className="analysis-artifact-header">
        <span className="analysis-artifact-icon" aria-hidden="true">
          <ChartIcon type={artifact.chart.spec.type} />
        </span>
        <div>
          <h3 id={`analysis-${resultId}`}>{artifact.chart.spec.title}</h3>
          {artifact.chart.spec.description ? (
            <p>{artifact.chart.spec.description}</p>
          ) : null}
        </div>
      </header>
      {artifact.result.rows.length === 0 ? (
        <div className="analysis-empty-state">
          <DatabaseZap size={20} />
          <p>No rows matched the selected filters.</p>
        </div>
      ) : (
        <TrustedChart spec={artifact.chart.spec} result={artifact.result} />
      )}
      {artifact.result.truncated ? (
        <p className="analysis-truncation">
          Result display was capped by the configured safety limit.
        </p>
      ) : null}
      <details className="analysis-disclosure">
        <summary>Data and provenance</summary>
        <ResultTable result={artifact.result} />
        <dl className="analysis-provenance">
          <div>
            <dt>Dataset version</dt>
            <dd>{shortId(artifact.result.datasetVersionId)}</dd>
          </div>
          <div>
            <dt>Rows returned</dt>
            <dd>{artifact.result.rowCount.toLocaleString()}</dd>
          </div>
          <div>
            <dt>Execution</dt>
            <dd>{artifact.result.executionMs.toLocaleString()} ms</dd>
          </div>
          <div>
            <dt>Operations</dt>
            <dd>
              {artifact.result.provenance.aggregations.join(", ") || "row selection"}
            </dd>
          </div>
        </dl>
        {artifact.result.provenance.assumptions.length > 0 ? (
          <div className="analysis-notes">
            <strong>Assumptions</strong>
            <ul>
              {artifact.result.provenance.assumptions.map((assumption) => (
                <li key={assumption}>{assumption}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {artifact.result.provenance.warnings.length > 0 ? (
          <div className="analysis-notes analysis-notes-warning">
            <strong>Warnings</strong>
            <ul>
              {artifact.result.provenance.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </details>
    </section>
  );
}

function TrustedChart({
  spec,
  result
}: {
  readonly spec: ChartSpecContract;
  readonly result: AnalysisResultArtifactContract;
}) {
  if (spec.type === "bar") return <BarChart spec={spec} rows={result.rows} />;
  if (spec.type === "line") return <LineChart spec={spec} rows={result.rows} />;
  if (spec.type === "pie") return <PieChartView spec={spec} rows={result.rows} />;
  if (spec.type === "scatter") return <ScatterChartView spec={spec} rows={result.rows} />;
  return <ResultTable result={result} />;
}

function BarChart({
  spec,
  rows
}: {
  readonly spec: ChartSpecContract;
  readonly rows: readonly AnalysisResultRowContract[];
}) {
  const category = spec.categoryField ?? spec.x?.field;
  const series = spec.series[0];
  if (!category || !series) return null;
  const values = rows.slice(0, 20).map((row) => numeric(row[series.field]));
  const max = Math.max(...values.map((value) => Math.abs(value)), 1);
  return (
    <div className="analysis-bar-chart" role="img" aria-label={spec.title}>
      {rows.slice(0, 20).map((row, index) => {
        const value = values[index] ?? 0;
        return (
          <div className="analysis-bar-row" key={`${String(row[category])}-${index}`}>
            <span title={String(row[category] ?? "No value")}>
              {String(row[category] ?? "No value")}
            </span>
            <div>
              <i style={{ width: `${Math.max(2, (Math.abs(value) / max) * 100)}%` }} />
            </div>
            <strong>{formatNumber(value, series.valueFormat, series.currency)}</strong>
          </div>
        );
      })}
    </div>
  );
}

function LineChart({
  spec,
  rows
}: {
  readonly spec: ChartSpecContract;
  readonly rows: readonly AnalysisResultRowContract[];
}) {
  const series = spec.series[0];
  const category = spec.x?.field;
  const values = series ? rows.map((row) => numeric(row[series.field])) : [];
  if (!series || !category || values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const points = values
    .map((value, index) => {
      const x = values.length === 1 ? 320 : 24 + (index / (values.length - 1)) * 592;
      const y = 208 - ((value - min) / range) * 176;
      return `${x},${y}`;
    })
    .join(" ");
  return (
    <div className="analysis-line-chart">
      <svg
        viewBox="0 0 640 240"
        role="img"
        aria-label={spec.title}
        preserveAspectRatio="none"
      >
        <line x1="24" y1="208" x2="616" y2="208" />
        <line x1="24" y1="32" x2="24" y2="208" />
        <polyline points={points} />
        {points.split(" ").map((point) => {
          const [cx, cy] = point.split(",");
          return <circle key={point} cx={cx} cy={cy} r="4" />;
        })}
      </svg>
      <div className="analysis-axis-labels">
        <span>{String(rows[0]?.[category] ?? "")}</span>
        <span>{series.label}</span>
        <span>{String(rows.at(-1)?.[category] ?? "")}</span>
      </div>
    </div>
  );
}

function PieChartView({
  spec,
  rows
}: {
  readonly spec: ChartSpecContract;
  readonly rows: readonly AnalysisResultRowContract[];
}) {
  const category = spec.categoryField ?? spec.x?.field;
  const series = spec.series[0];
  if (!category || !series) return null;
  const slices = rows.slice(0, 8).map((row, index) => ({
    label: String(row[category] ?? "No value"),
    value: Math.max(0, numeric(row[series.field])),
    color: chartColors[index % chartColors.length] ?? "#177d65"
  }));
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const background = pieBackground(slices, total);
  return (
    <div className="analysis-pie-layout">
      <div
        className="analysis-pie"
        style={{ background }}
        role="img"
        aria-label={spec.title}
      />
      <ul className="analysis-legend">
        {slices.map((slice) => (
          <li key={slice.label}>
            <i style={{ backgroundColor: slice.color }} />
            <span>{slice.label}</span>
            <strong>
              {formatNumber(slice.value, series.valueFormat, series.currency)}
            </strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ScatterChartView({
  spec,
  rows
}: {
  readonly spec: ChartSpecContract;
  readonly rows: readonly AnalysisResultRowContract[];
}) {
  const xField = spec.x?.field;
  const series = spec.series[0];
  if (!xField || !series) return null;
  const points = rows
    .map((row) => ({ x: numeric(row[xField]), y: numeric(row[series.field]) }))
    .slice(0, 100);
  const xValues = points.map((point) => point.x);
  const yValues = points.map((point) => point.y);
  const xMin = Math.min(...xValues);
  const xRange = Math.max(...xValues) - xMin || 1;
  const yMin = Math.min(...yValues);
  const yRange = Math.max(...yValues) - yMin || 1;
  return (
    <div className="analysis-line-chart">
      <svg
        viewBox="0 0 640 240"
        role="img"
        aria-label={spec.title}
        preserveAspectRatio="none"
      >
        <line x1="24" y1="208" x2="616" y2="208" />
        <line x1="24" y1="32" x2="24" y2="208" />
        {points.map((point, index) => (
          <circle
            key={`${point.x}-${point.y}-${index}`}
            cx={24 + ((point.x - xMin) / xRange) * 592}
            cy={208 - ((point.y - yMin) / yRange) * 176}
            r="4"
          />
        ))}
      </svg>
    </div>
  );
}

function ResultTable({ result }: { readonly result: AnalysisResultArtifactContract }) {
  return (
    <div className="analysis-table-scroll">
      <table className="analysis-table">
        <thead>
          <tr>
            {result.schema.map((column) => (
              <th scope="col" key={column.field}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((row, index) => (
            <tr key={index}>
              {result.schema.map((column) => (
                <td key={column.field}>
                  {formatCell(row[column.field], column.dataType)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ChartIcon({ type }: { readonly type: ChartSpecContract["type"] }) {
  if (type === "bar") return <BarChart3 size={18} />;
  if (type === "line") return <ChartLine size={18} />;
  if (type === "pie") return <PieChart size={18} />;
  if (type === "scatter") return <ScatterChart size={18} />;
  return <Table2 size={18} />;
}

function AnalysisSkeleton() {
  return (
    <div className="analysis-artifact" aria-label="Loading analysis result">
      <Skeleton className="h-5 w-2/5" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

function numeric(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function formatNumber(
  value: number,
  format: ChartSpecContract["series"][number]["valueFormat"],
  currency?: string
): string {
  if (format === "currency" && currency) {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2
    }).format(value);
  }
  if (format === "percent") {
    return new Intl.NumberFormat(undefined, {
      style: "percent",
      maximumFractionDigits: 2
    }).format(value);
  }
  return new Intl.NumberFormat(undefined, {
    notation: format === "compact" ? "compact" : "standard",
    maximumFractionDigits: format === "integer" ? 0 : 2
  }).format(value);
}

function formatCell(value: unknown, type: "category" | "number" | "date"): string {
  if (value === null || value === undefined || value === "") return "Not available";
  if (type === "number") return formatNumber(numeric(value), "raw");
  if (type === "date") {
    const date = new Date(String(value));
    if (!Number.isNaN(date.valueOf())) return new Intl.DateTimeFormat().format(date);
  }
  return String(value);
}

function shortId(value: string): string {
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function pieBackground(
  slices: readonly { readonly value: number; readonly color: string }[],
  total: number
): string {
  if (total <= 0) return "var(--color-subtle)";
  let cursor = 0;
  const stops = slices.map((slice) => {
    const start = cursor;
    cursor += (slice.value / total) * 100;
    return `${slice.color} ${start}% ${cursor}%`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}
