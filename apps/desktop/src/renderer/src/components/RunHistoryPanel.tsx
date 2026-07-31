import { useEffect, useState } from "react";
import { api, type RecentRun, type RunDetail } from "../api/client";

export interface RunHistoryPanelProps {
  suiteId: string;
}

const STATUS_BADGE_CLASS: Record<string, string> = {
  passed: "badge badge-pass",
  failed: "badge badge-fail",
  blocked: "badge badge-blocked",
  running: "badge badge-neutral",
  pending: "badge badge-neutral",
};

const VERDICT_BADGE_CLASS: Record<string, string> = {
  pass: "badge badge-pass",
  fail: "badge badge-fail",
  blocked: "badge badge-blocked",
};

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function RunHistoryPanel({ suiteId }: RunHistoryPanelProps): JSX.Element {
  const [history, setHistory] = useState<RecentRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [report, setReport] = useState<{ format: "markdown" | "csv"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const runs = await api.runs.historyForSuite(suiteId);
        if (!cancelled) setHistory(runs);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [suiteId]);

  async function selectRun(runId: string): Promise<void> {
    setSelectedRunId(runId);
    setDetail(null);
    setReport(null);
    setDetailLoading(true);
    try {
      setDetail(await api.runs.detail(runId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDetailLoading(false);
    }
  }

  async function viewReport(format: "markdown" | "csv"): Promise<void> {
    if (!selectedRunId) return;
    try {
      const text = await api.runs.report(selectedRunId, format);
      setReport({ format, text });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function downloadReport(format: "markdown" | "csv"): void {
    if (!selectedRunId) return;
    api.runs
      .report(selectedRunId, format)
      .then((text) => {
        const blob = new Blob([text], { type: format === "csv" ? "text/csv" : "text/markdown" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `run-${selectedRunId.slice(0, 8)}-report.${format === "csv" ? "csv" : "md"}`;
        link.click();
        URL.revokeObjectURL(url);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }

  return (
    <>
      <h3>Run history</h3>
      {error && <p role="alert">{error}</p>}
      {loading ? (
        <p>Loading…</p>
      ) : (
        <ul className="item-list">
          {history.map((run) => (
            <li key={run.runId} className="item-row">
              <div className="item-row-main">
                <button type="button" className="item-title-btn" onClick={() => void selectRun(run.runId)}>
                  Run {run.runId.slice(0, 8)}
                </button>
                <span className="item-subtext">
                  {run.trigger} · {formatTimestamp(run.startedAt)}
                </span>
              </div>
              <span className={STATUS_BADGE_CLASS[run.status] ?? "badge badge-neutral"}>{run.status}</span>
            </li>
          ))}
          {history.length === 0 && <li className="empty-state">No runs yet for this suite.</li>}
        </ul>
      )}

      {selectedRunId && (
        <div className="run-panel">
          {detailLoading && <p>Loading run…</p>}
          {detail && (
            <>
              <div className="run-panel-header">
                <span className="run-id">Run {detail.runId.slice(0, 8)}</span>
                <span className={STATUS_BADGE_CLASS[detail.status] ?? "badge badge-neutral"}>{detail.status}</span>
              </div>
              <ol className="step-list">
                {detail.steps.map((step) => (
                  <li key={step.id} className="step-item">
                    <span className={VERDICT_BADGE_CLASS[step.verdict] ?? "badge badge-neutral"}>
                      {step.verdict}
                    </span>{" "}
                    {step.observation}
                    {step.verdict !== "pass" && (
                      <div className="step-item-reason">
                        {step.confidenceReason} (confidence {Math.round(step.confidence * 100)}%)
                      </div>
                    )}
                  </li>
                ))}
                {detail.steps.length === 0 && <li className="empty-state">No step logs recorded for this run.</li>}
              </ol>

              {detail.suiteId && (
                <div className="field-row report-actions">
                  <button type="button" className="btn btn-sm" onClick={() => void viewReport("markdown")}>
                    View report
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => downloadReport("markdown")}>
                    Download .md
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => downloadReport("csv")}>
                    Download .csv
                  </button>
                </div>
              )}

              {report && <pre className="report-preview">{report.text}</pre>}
            </>
          )}
        </div>
      )}
    </>
  );
}
