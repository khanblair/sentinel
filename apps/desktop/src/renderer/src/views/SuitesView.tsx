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
      <button type="button" onClick={onBack}>
        ← Projects
      </button>
      <h2>{project.name} — Suites</h2>
      {error && <p role="alert">{error}</p>}
      <form onSubmit={(event) => void handleCreate(event)}>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="New suite name"
          aria-label="New suite name"
        />
        <button type="submit">Create suite</button>
      </form>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <ul>
          {suites.map((suite) => (
            <li key={suite.id}>
              <button type="button" onClick={() => onSelectSuite(suite)}>
                {suite.name}
              </button>
            </li>
          ))}
          {suites.length === 0 && <li>No suites yet — create one above.</li>}
        </ul>
      )}
    </section>
  );
}
