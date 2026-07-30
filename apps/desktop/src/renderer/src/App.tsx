import { useCallback, useEffect, useState } from "react";
import type { Project, Run, RunMode, ServerMessage, StepLog, Suite } from "@sentinel/shared";
import { api, backendHttpUrl, backendWsUrl } from "./api/client";
import { useBackendSocket } from "./ws/useBackendSocket";
import { ProjectsView } from "./views/ProjectsView";
import { SuitesView } from "./views/SuitesView";
import { SuiteDetailView } from "./views/SuiteDetailView";
import { SettingsView } from "./views/SettingsView";
import type { PendingPrompt } from "./components/RunTicker";

type View = "projects" | "suites" | "suite-detail" | "settings";
type HealthState = "checking" | "connected" | "unreachable";

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

  return (
    <main>
      <header>
        <h1>Sentinel</h1>
        <p>
          Backend: <strong>{health}</strong> · Live updates: <strong>{connectionState}</strong>
        </p>
        <nav>
          <button type="button" onClick={() => setView("projects")}>
            Projects
          </button>
          <button type="button" onClick={() => setView("settings")}>
            Settings
          </button>
        </nav>
      </header>

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
    </main>
  );
}
