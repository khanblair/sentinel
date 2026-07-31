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

  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareDetails, setCompareDetails] = useState<[RunDetail, RunDetail] | null>(null);
  const [comparing, setComparing] = useState(false);

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

  function toggleCompare(runId: string): void {
    setCompareDetails(null);
    setCompareIds((prev) => {
      if (prev.includes(runId)) return prev.filter((id) => id !== runId);
      if (prev.length >= 2) return [prev[1]!, runId];
      return [...prev, runId];
    });
  }

  async function handleCompare(): Promise<void> {
    if (compareIds.length !== 2) return;
    setError(null);
    setComparing(true);
    try {
      const [a, b] = await Promise.all([api.runs.detail(compareIds[0]!), api.runs.detail(compareIds[1]!)]);
      setCompareDetails([a, b]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setComparing(false);
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
              <label className="run-compare-checkbox" title="Select to compare">
                <input
                  type="checkbox"
                  checked={compareIds.includes(run.runId)}
                  onChange={() => toggleCompare(run.runId)}
                  aria-label={`Select run ${run.runId.slice(0, 8)} to compare`}
                />
              </label>
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

      {compareIds.length > 0 && (
        <div className="field-row">
          <span className="item-subtext">{compareIds.length}/2 selected to compare</span>
          <button type="button" className="btn btn-sm" onClick={() => void handleCompare()} disabled={compareIds.length !== 2}>
            {comparing ? "Comparing…" : "Compare selected"}
          </button>
          <button type="button" className="btn btn-sm" onClick={() => { setCompareIds([]); setCompareDetails(null); }}>
            Clear
          </button>
        </div>
      )}

      {compareDetails && (
        <div className="run-compare-grid">
          {compareDetails.map((runDetail) => (
            <div key={runDetail.runId} className="run-panel">
              <div className="run-panel-header">
                <span className="run-id">Run {runDetail.runId.slice(0, 8)}</span>
                <span className={STATUS_BADGE_CLASS[runDetail.status] ?? "badge badge-neutral"}>
                  {runDetail.status}
                </span>
              </div>
              <ol className="step-list">
                {runDetail.steps.map((step) => (
                  <li key={step.id} className="step-item">
                    <span className={VERDICT_BADGE_CLASS[step.verdict] ?? "badge badge-neutral"}>
                      {step.verdict}
                    </span>{" "}
                    {step.observation}
                  </li>
                ))}
                {runDetail.steps.length === 0 && <li className="empty-state">No step logs recorded.</li>}
              </ol>
            </div>
          ))}
        </div>
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
