import { useEffect, useState } from "react";
import type { Environment, Project, Suite } from "@sentinel/shared";
import { api, type ModuleRisk } from "../api/client";

export interface SuitesViewProps {
  project: Project;
  onBack: () => void;
  onSelectSuite: (suite: Suite) => void;
}

export function SuitesView({ project, onBack, onSelectSuite }: SuitesViewProps): JSX.Element {
  const [suites, setSuites] = useState<Suite[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [envName, setEnvName] = useState("");
  const [envBaseUrl, setEnvBaseUrl] = useState("");

  const [heatmap, setHeatmap] = useState<ModuleRisk[]>([]);

  async function refresh(): Promise<void> {
    try {
      const [suiteList, envList, heatmapData] = await Promise.all([
        api.suites.listByProject(project.id),
        api.environments.listByProject(project.id),
        api.analytics.heatmap(project.id),
      ]);
      setSuites(suiteList);
      setEnvironments(envList);
      setHeatmap(heatmapData);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  async function handleCreate(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!name.trim()) return;
    setError(null);
    try {
      await api.suites.create(project.id, { name });
      setName("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleArchiveSuite(id: string): Promise<void> {
    try {
      await api.suites.archive(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleCloneSuite(id: string): Promise<void> {
    try {
      await api.suites.clone(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleCreateEnvironment(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!envName.trim() || !envBaseUrl.trim()) return;
    setError(null);
    try {
      await api.environments.create(project.id, { name: envName, baseUrl: envBaseUrl });
      setEnvName("");
      setEnvBaseUrl("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleDeleteEnvironment(id: string): Promise<void> {
    try {
      await api.environments.remove(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section>
      <button type="button" className="back-link" onClick={onBack}>
        ← Projects
      </button>
      <h2>{project.name}</h2>
      <p>Suites</p>
      {error && <p role="alert">{error}</p>}

      {loading ? (
        <p>Loading…</p>
      ) : (
        <ul className="item-list">
          {suites.map((suite) => (
            <li key={suite.id} className="item-row">
              <div className="item-row-main">
                <button type="button" className="item-title-btn" onClick={() => onSelectSuite(suite)}>
                  {suite.name}
                </button>
              </div>
              <div className="field-row">
                <button type="button" className="btn btn-sm" onClick={() => void handleCloneSuite(suite.id)}>
                  Clone
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  onClick={() => void handleArchiveSuite(suite.id)}
                >
                  Archive
                </button>
              </div>
            </li>
          ))}
          {suites.length === 0 && <li className="empty-state">No suites yet — create one below.</li>}
        </ul>
      )}

      <h3>New suite</h3>
      <form className="field-row" onSubmit={(event) => void handleCreate(event)}>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Suite name"
          aria-label="New suite name"
        />
        <button type="submit" className="btn btn-primary">
          Create suite
        </button>
      </form>

      <h3>Environments</h3>
      <ul className="item-list">
        {environments.map((env) => (
          <li key={env.id} className="item-row">
            <div className="item-row-main">
              <span className="item-title-btn item-title-static">{env.name}</span>
              <span className="item-subtext">{env.baseUrl}</span>
            </div>
            <button type="button" className="btn btn-sm btn-danger" onClick={() => void handleDeleteEnvironment(env.id)}>
              Delete
            </button>
          </li>
        ))}
        {environments.length === 0 && <li className="empty-state">No environments yet — add one below.</li>}
      </ul>

      <form className="field-row" onSubmit={(event) => void handleCreateEnvironment(event)}>
        <input
          value={envName}
          onChange={(event) => setEnvName(event.target.value)}
          placeholder="Environment name"
          aria-label="New environment name"
        />
        <input
          value={envBaseUrl}
          onChange={(event) => setEnvBaseUrl(event.target.value)}
          placeholder="https://staging.example.com"
          aria-label="New environment base URL"
        />
        <button type="submit" className="btn btn-primary">
          Add environment
        </button>
      </form>

      <h3>Module risk heatmap</h3>
      <ul className="item-list">
        {heatmap.map((risk) => (
          <li key={`${risk.module}-${risk.subModule ?? ""}`} className="item-row">
            <div className="item-row-main">
              <span className="item-title-btn item-title-static">
                {risk.module}
                {risk.subModule ? ` / ${risk.subModule}` : ""}
              </span>
              <span className="item-subtext">
                {risk.failCount} of {risk.total} runs failed
              </span>
            </div>
            <span className={risk.failRate > 0.3 ? "badge badge-fail" : "badge badge-neutral"}>
              {Math.round(risk.failRate * 100)}%
            </span>
          </li>
        ))}
        {heatmap.length === 0 && <li className="empty-state">No test outcomes recorded yet across this project.</li>}
      </ul>
    </section>
  );
}
