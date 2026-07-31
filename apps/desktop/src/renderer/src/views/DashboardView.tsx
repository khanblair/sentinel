import { useEffect, useState } from "react";
import type { Project } from "@sentinel/shared";
import { api, type RecentRun } from "../api/client";

export interface DashboardViewProps {
  onGoToProjects: () => void;
  onSelectRecentRun: (run: RecentRun) => void;
}

const STATUS_BADGE_CLASS: Record<string, string> = {
  passed: "badge badge-pass",
  failed: "badge badge-fail",
  blocked: "badge badge-blocked",
  running: "badge badge-neutral",
  pending: "badge badge-neutral",
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function DashboardView({ onGoToProjects, onSelectRecentRun }: DashboardViewProps): JSX.Element {
  const [projects, setProjects] = useState<Project[]>([]);
  const [recentRuns, setRecentRuns] = useState<RecentRun[]>([]);
  const [runCount, setRunCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load(): Promise<void> {
      try {
        const [projectList, runs, runTotal] = await Promise.all([
          api.projects.list(),
          api.runs.recent(8),
          api.runs.count(),
        ]);
        setProjects(projectList);
        setRecentRuns(runs);
        setRunCount(runTotal.count);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  return (
    <section>
      <h2>Dashboard</h2>
      {error && <p role="alert">{error}</p>}

      <div className="stat-row">
        <div className="stat-card">
          <span className="stat-value">{projects.length}</span>
          <span className="stat-label">Projects</span>
        </div>
        <div className="stat-card">
          <span className="stat-value">{runCount ?? "—"}</span>
          <span className="stat-label">Total runs</span>
        </div>
        <button type="button" className="btn btn-primary stat-cta" onClick={onGoToProjects}>
          + New project
        </button>
      </div>

      <h3>Recent runs</h3>
      {loading ? (
        <p>Loading…</p>
      ) : (
        <ul className="item-list">
          {recentRuns.map((run) => (
            <li key={run.runId} className="item-row">
              <div className="item-row-main">
                <button
                  type="button"
                  className="item-title-btn"
                  disabled={!run.projectId || !run.suiteId}
                  onClick={() => onSelectRecentRun(run)}
                >
                  {run.projectName ?? "Unknown project"} / {run.suiteName ?? "Unknown suite"}
                </button>
                <span className="item-subtext">
                  {run.trigger} · {timeAgo(run.startedAt)}
                </span>
              </div>
              <span className={STATUS_BADGE_CLASS[run.status] ?? "badge badge-neutral"}>{run.status}</span>
            </li>
          ))}
          {recentRuns.length === 0 && (
            <li className="empty-state">No runs yet — open a project and run a suite to see activity here.</li>
          )}
        </ul>
      )}

      <h3>Projects</h3>
      <ul className="item-list">
        {projects.slice(0, 5).map((project) => (
          <li key={project.id} className="item-row">
            <div className="item-row-main">
              <button type="button" className="item-title-btn" onClick={onGoToProjects}>
                {project.name}
              </button>
            </div>
          </li>
        ))}
        {projects.length === 0 && <li className="empty-state">No projects yet.</li>}
      </ul>
    </section>
  );
}
