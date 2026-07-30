import { useCallback, useEffect, useState } from "react";
import type { Project, Run, RunMode, ServerMessage, StepLog, Suite } from "@sentinel/shared";
import { api, backendHttpUrl, backendWsUrl } from "./api/client";
import { useBackendSocket, type SocketConnectionState } from "./ws/useBackendSocket";
import { ProjectsView } from "./views/ProjectsView";
import { SuitesView } from "./views/SuitesView";
import { SuiteDetailView } from "./views/SuiteDetailView";
import { SettingsView } from "./views/SettingsView";
import type { PendingPrompt } from "./components/RunTicker";

type View = "projects" | "suites" | "suite-detail" | "settings";
type HealthState = "checking" | "connected" | "unreachable";
type DotState = "ok" | "pending" | "bad";

function statusDotClass(state: DotState): string {
  return `status-dot ${state}`;
}

function healthDotState(health: HealthState): DotState {
  if (health === "connected") return "ok";
  if (health === "checking") return "pending";
  return "bad";
}

function connectionDotState(state: SocketConnectionState): DotState {
  if (state === "connected") return "ok";
  if (state === "connecting") return "pending";
  return "bad";
}

export function App(): JSX.Element {
  const [view, setView] = useState<View>("projects");
  const [project, setProject] = useState<Project | null>(null);
  const [suite, setSuite] = useState<Suite | null>(null);

  const [health, setHealth] = useState<HealthState>("checking");
  const [activeRun, setActiveRun] = useState<Run | null>(null);
  const [activeRunSteps, setActiveRunSteps] = useState<StepLog[]>([]);
  const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function checkHealth(): Promise<void> {
      try {
        const response = await fetch(`${backendHttpUrl()}/health`);
        if (!cancelled) setHealth(response.ok ? "connected" : "unreachable");
      } catch {
        if (!cancelled) setHealth("unreachable");
      }
    }
    void checkHealth();
    const interval = setInterval(() => void checkHealth(), 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const handleMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      case "run:update":
        setActiveRun((previous) => {
          if (previous?.id !== message.run.id) {
            setActiveRunSteps([]);
          }
          return message.run;
        });
        break;
      case "run:step":
        setActiveRunSteps((previous) =>
          previous.some((step) => step.id === message.step.id) ? previous : [...previous, message.step],
        );
        break;
      case "run:prompt":
        setPendingPrompt({ runId: message.runId, requestId: message.requestId, prompt: message.prompt });
        break;
      case "error":
        console.error("Backend WS error:", message.message);
        break;
      default:
        break;
    }
  }, []);

  const { connectionState, send } = useBackendSocket(backendWsUrl(), handleMessage);

  function handleAnswerPrompt(requestId: string, value: string | null): void {
    send({ type: "run:prompt-response", requestId, value });
    setPendingPrompt(null);
  }

  function handleTriggerRun(input: {
    assistantId: string;
    environmentId?: string | null;
    mode: RunMode;
    providerConfigId: string;
    model: string;
  }): void {
    if (!suite) return;
    api.runs.trigger(suite.id, input).catch((err: unknown) => {
      console.error("Failed to trigger run:", err);
    });
  }

  const onProjectsTab = view === "projects" || view === "suites" || view === "suite-detail";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="sidebar-brand-mark" />
          <span className="sidebar-brand-name">Sentinel</span>
        </div>

        <nav className="sidebar-nav">
          <button
            type="button"
            className={`nav-item${onProjectsTab ? " active" : ""}`}
            onClick={() => setView("projects")}
          >
            <span className="nav-item-icon">▤</span> Projects
          </button>
          <button
            type="button"
            className={`nav-item${view === "settings" ? " active" : ""}`}
            onClick={() => setView("settings")}
          >
            <span className="nav-item-icon">⚙</span> Settings
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="status-row">
            <span className={statusDotClass(healthDotState(health))} /> Backend {health}
          </div>
          <div className="status-row">
            <span className={statusDotClass(connectionDotState(connectionState))} /> Live updates{" "}
            {connectionState}
          </div>
        </div>
      </aside>

      <main className="main-content">
        <div className="content-container">
          {view === "projects" && (
            <ProjectsView
              onSelectProject={(selected) => {
                setProject(selected);
                setView("suites");
              }}
            />
          )}

          {view === "suites" && project && (
            <SuitesView
              project={project}
              onBack={() => setView("projects")}
              onSelectSuite={(selected) => {
                setSuite(selected);
                setView("suite-detail");
              }}
            />
          )}

          {view === "suite-detail" && suite && (
            <SuiteDetailView
              suite={suite}
              onBack={() => setView("suites")}
              onTriggerRun={handleTriggerRun}
              activeRun={activeRun}
              activeRunSteps={activeRunSteps}
              pendingPrompt={pendingPrompt}
              onAnswerPrompt={handleAnswerPrompt}
            />
          )}

          {view === "settings" && <SettingsView />}
        </div>
      </main>
    </div>
  );
}
