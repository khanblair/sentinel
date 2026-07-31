import { useEffect, useMemo, useRef, useState } from "react";
import type { Project } from "@sentinel/shared";
import { api } from "../api/client";

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onGoToDashboard: () => void;
  onGoToProjects: () => void;
  onGoToSettings: () => void;
  onGoToNewChat: () => void;
  onSelectProject: (project: Project) => void;
}

interface Command {
  id: string;
  label: string;
  hint: string;
  run: () => void;
}

export function CommandPalette({
  open,
  onClose,
  onGoToDashboard,
  onGoToProjects,
  onGoToSettings,
  onGoToNewChat,
  onSelectProject,
}: CommandPaletteProps): JSX.Element | null {
  const [query, setQuery] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedIndex(0);
    api.projects.list().then(setProjects).catch(() => setProjects([]));
    const timer = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [open]);

  const commands: Command[] = useMemo(() => {
    const navCommands: Command[] = [
      { id: "nav-dashboard", label: "Go to Dashboard", hint: "Navigate", run: onGoToDashboard },
      { id: "nav-newchat", label: "New chat", hint: "Navigate", run: onGoToNewChat },
      { id: "nav-projects", label: "Go to Projects", hint: "Navigate", run: onGoToProjects },
      { id: "nav-settings", label: "Go to Settings", hint: "Navigate", run: onGoToSettings },
    ];
    const projectCommands: Command[] = projects.map((project) => ({
      id: `project-${project.id}`,
      label: project.name,
      hint: "Project",
      run: () => onSelectProject(project),
    }));
    return [...navCommands, ...projectCommands];
  }, [projects, onGoToDashboard, onGoToNewChat, onGoToProjects, onGoToSettings, onSelectProject]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter((c) => c.label.toLowerCase().includes(q));
  }, [commands, query]);

  useEffect(() => {
    setSelectedIndex((prev) => Math.min(prev, Math.max(filtered.length - 1, 0)));
  }, [filtered.length]);

  function runSelected(): void {
    const command = filtered[selectedIndex];
    if (!command) return;
    command.run();
    onClose();
  }

  function handleKeyDown(event: React.KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      runSelected();
    }
  }

  if (!open) return null;

  return (
    <div className="command-palette-backdrop" onClick={onClose}>
      <div className="command-palette" onClick={(e) => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a command or search projects…"
          aria-label="Command palette"
          className="command-palette-input"
        />
        <ul className="command-palette-list">
          {filtered.map((command, index) => (
            <li
              key={command.id}
              className={`command-palette-item${index === selectedIndex ? " active" : ""}`}
              onMouseEnter={() => setSelectedIndex(index)}
              onClick={runSelected}
            >
              <span>{command.label}</span>
              <span className="command-palette-hint">{command.hint}</span>
            </li>
          ))}
          {filtered.length === 0 && <li className="command-palette-empty">No matches.</li>}
        </ul>
      </div>
    </div>
  );
}
