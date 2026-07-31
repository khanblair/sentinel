import { useEffect, useState } from "react";
import { api, type FlakyCase, type RunTrendPoint, type UsageByProviderModel } from "../api/client";

export interface AnalyticsPanelProps {
  suiteId: string;
}

const STATUS_BADGE_CLASS: Record<string, string> = {
  passed: "badge badge-pass",
  failed: "badge badge-fail",
  blocked: "badge badge-blocked",
};

export function AnalyticsPanel({ suiteId }: AnalyticsPanelProps): JSX.Element {
  const [trend, setTrend] = useState<RunTrendPoint[]>([]);
  const [flaky, setFlaky] = useState<FlakyCase[]>([]);
  const [usage, setUsage] = useState<UsageByProviderModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load(): Promise<void> {
      try {
        const [trendData, flakyData, usageData] = await Promise.all([
          api.analytics.trend(suiteId),
          api.analytics.flakyCases(suiteId),
          api.analytics.usage(suiteId),
        ]);
        if (cancelled) return;
        setTrend(trendData);
        setFlaky(flakyData);
        setUsage(usageData);
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

  if (loading) return <p>Loading analytics…</p>;

  return (
    <>
      <h3>Analytics</h3>
      {error && <p role="alert">{error}</p>}

      <p className="item-subtext">Pass/fail trend</p>
      <div className="trend-strip">
        {trend.map((point) => (
          <span key={point.runId} className={STATUS_BADGE_CLASS[point.status] ?? "badge badge-neutral"} title={point.startedAt}>
            {point.status === "passed" ? "✓" : point.status === "failed" ? "✕" : "•"}
          </span>
        ))}
        {trend.length === 0 && <span className="item-subtext">No runs yet.</span>}
      </div>

      <p className="item-subtext">Flaky test cases</p>
      <ul className="item-list">
        {flaky.map((testCase) => (
          <li key={testCase.testCaseId} className="item-row">
            <div className="item-row-main">
              <span className="item-title-btn item-title-static">Test case {testCase.testCaseId.slice(0, 8)}</span>
              <span className="item-subtext">Flipped {testCase.flipCount} times recently</span>
            </div>
          </li>
        ))}
        {flaky.length === 0 && <li className="empty-state">No flaky cases detected.</li>}
      </ul>

      <p className="item-subtext">Provider usage</p>
      <ul className="item-list">
        {usage.map((row) => (
          <li key={`${row.provider}-${row.model}`} className="item-row">
            <div className="item-row-main">
              <span className="item-title-btn item-title-static">
                {row.provider} / {row.model}
              </span>
              <span className="item-subtext">
                {row.promptTokens + row.completionTokens} tokens across {row.runCount} run
                {row.runCount === 1 ? "" : "s"}
                {row.estimatedCostUsd !== null ? ` · $${row.estimatedCostUsd.toFixed(4)}` : ""}
              </span>
            </div>
          </li>
        ))}
        {usage.length === 0 && <li className="empty-state">No provider usage recorded yet.</li>}
      </ul>
    </>
  );
}
