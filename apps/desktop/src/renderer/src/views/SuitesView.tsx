import { useEffect, useState } from "react";
import type { Project, Suite } from "@sentinel/shared";
import { api } from "../api/client";

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

  async function refresh(): Promise<void> {
    try {
      setSuites(await api.suites.listByProject(project.id));
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
    </section>
  );
}
