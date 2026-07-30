import { useEffect, useState } from "react";
import type { Project } from "@sentinel/shared";
import { api } from "../api/client";

export interface ProjectsViewProps {
  onSelectProject: (project: Project) => void;
}

export function ProjectsView({ onSelectProject }: ProjectsViewProps): JSX.Element {
  const [projects, setProjects] = useState<Project[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh(): Promise<void> {
    try {
      setProjects(await api.projects.list());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleCreate(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!name.trim()) return;
    setError(null);
    try {
      await api.projects.create({ name });
      setName("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleDelete(id: string): Promise<void> {
    setError(null);
    try {
      await api.projects.remove(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <section>
      <h2>Projects</h2>
      {error && <p role="alert">{error}</p>}
      <form onSubmit={(event) => void handleCreate(event)}>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="New project name"
          aria-label="New project name"
        />
        <button type="submit">Create project</button>
      </form>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <ul>
          {projects.map((project) => (
            <li key={project.id}>
              <button type="button" onClick={() => onSelectProject(project)}>
                {project.name}
              </button>
              <button type="button" onClick={() => void handleDelete(project.id)} aria-label={`Delete ${project.name}`}>
                Delete
              </button>
            </li>
          ))}
          {projects.length === 0 && <li>No projects yet — create one above.</li>}
        </ul>
      )}
    </section>
  );
}
