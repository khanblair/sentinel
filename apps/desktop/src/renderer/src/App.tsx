import { useCallback, useEffect, useRef, useState } from "react";
import type { Project, Run, RunMode, ServerMessage, StepLog, Suite } from "@sentinel/shared";
import { api, backendHttpUrl, backendWsUrl, type RecentRun } from "./api/client";
import { useBackendSocket, type SocketConnectionState } from "./ws/useBackendSocket";
import { DashboardView } from "./views/DashboardView";
import { ProjectsView } from "./views/ProjectsView";
import { SuitesView } from "./views/SuitesView";
import { SuiteDetailView } from "./views/SuiteDetailView";
import { SettingsView } from "./views/SettingsView";
import { AdHocView } from "./views/AdHocView";
import type { PendingPrompt } from "./components/RunTicker";
import { CommandPalette } from "./components/CommandPalette";
import { OnboardingModal } from "./components/OnboardingModal";
import { PreviewPanel, type PreviewFrame } from "./components/PreviewPanel";
import { useTheme } from "./hooks/useTheme";
import { notifyRunFinished, requestNotificationPermission } from "./notifications";

const PREVIEW_OPEN_KEY = "sentinel-preview-open";
const PREVIEW_WIDTH_KEY = "sentinel-preview-width";
const DEFAULT_PREVIEW_WIDTH = 420;
const MIN_PREVIEW_WIDTH = 280;
const MAX_PREVIEW_WIDTH = 900;

type View = "dashboard" | "projects" | "suites" | "suite-detail" | "settings" | "adhoc";
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
  const [view, setView] = useState<View>("dashboard");
  const [project, setProject] = useState<Project | null>(null);
  const [suite, setSuite] = useState<Suite | null>(null);

  const [theme, toggleTheme] = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(
    () => window.localStorage.getItem("sentinel-onboarding-dismissed") !== "true",
  );
  const [health, setHealth] = useState<HealthState>("checking");
  const [activeRun, setActiveRun] = useState<Run | null>(null);
  const [activeRunSteps, setActiveRunSteps] = useState<StepLog[]>([]);
  const [pendingPrompt, setPendingPrompt] = useState<PendingPrompt | null>(null);

  const [previewOpen, setPreviewOpen] = useState(() => window.localStorage.getItem(PREVIEW_OPEN_KEY) === "true");
  const [previewWidth, setPreviewWidth] = useState(
    () => Number(window.localStorage.getItem(PREVIEW_WIDTH_KEY)) || DEFAULT_PREVIEW_WIDTH,
  );
  const [previewFrame, setPreviewFrame] = useState<PreviewFrame | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewActionWarning, setPreviewActionWarning] = useState<string | null>(null);
  const watchedRunIdRef = useRef<string | null>(null);
  const previewWarningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleMessage = useCallback((message: ServerMessage) => {
    switch (message.type) {
      case "run:update":
        setActiveRun((previous) => {
          if (previous?.id !== message.run.id) {
            setActiveRunSteps([]);
          }
          if (previous?.status === "running" && message.run.status !== "running" && !document.hasFocus()) {
            notifyRunFinished(message.run);
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
      case "preview:frame":
        setPreviewFrame({ dataBase64: message.dataBase64, metadata: message.metadata });
        break;
      case "preview:url":
        setPreviewUrl(message.url);
        break;
      case "preview:action-result":
        if (!message.ok && message.reason) {
          setPreviewActionWarning(message.reason);
          if (previewWarningTimerRef.current) clearTimeout(previewWarningTimerRef.current);
          previewWarningTimerRef.current = setTimeout(() => setPreviewActionWarning(null), 4000);
        }
        break;
      case "error":
        console.error("Backend WS error:", message.message);
        break;
      default:
        break;
    }
  }, []);

  const { connectionState, send } = useBackendSocket(backendWsUrl(), handleMessage);

  // Live preview (design §5.4) start/stop tracks two things at once: the panel's
  // own open/closed toggle, and which run (if any) is actually running right now —
  // there's no browser to preview once a run finishes (runSuite/runAdHoc tear the
  // Page down as soon as they're done). Switching between the two keeps exactly one
  // preview:start outstanding at a time, stopping the previous one first.
  useEffect(() => {
    const wantRunId = previewOpen && activeRun?.status === "running" ? activeRun.id : null;
    if (watchedRunIdRef.current === wantRunId) return;
    if (watchedRunIdRef.current) {
      send({ type: "preview:stop", runId: watchedRunIdRef.current });
    }
    if (wantRunId) {
      setPreviewFrame(null);
      setPreviewUrl(null);
      send({ type: "preview:start", runId: wantRunId });
    }
    watchedRunIdRef.current = wantRunId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewOpen, activeRun?.id, activeRun?.status]);

  useEffect(() => {
    return () => {
      if (watchedRunIdRef.current) {
        send({ type: "preview:stop", runId: watchedRunIdRef.current });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function togglePreview(): void {
    setPreviewOpen((prev) => {
      const next = !prev;
      window.localStorage.setItem(PREVIEW_OPEN_KEY, String(next));
      return next;
    });
  }

  function handlePreviewResizeStart(event: React.MouseEvent): void {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = previewWidth;

    function handleMouseMove(moveEvent: MouseEvent): void {
      const next = Math.min(
        MAX_PREVIEW_WIDTH,
        Math.max(MIN_PREVIEW_WIDTH, startWidth - (moveEvent.clientX - startX)),
      );
      setPreviewWidth(next);
    }
    function handleMouseUp(): void {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      setPreviewWidth((current) => {
        window.localStorage.setItem(PREVIEW_WIDTH_KEY, String(current));
        return current;
      });
    }
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
  }

  function dismissOnboarding(): void {
    window.localStorage.setItem("sentinel-onboarding-dismissed", "true");
    setShowOnboarding(false);
  }

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

  function handleTriggerAdHocRun(input: {
    url: string;
    checklist: string[];
    assistantId: string;
    mode: RunMode;
    providerConfigId: string;
    model: string;
  }): void {
    api.adhoc.run(input).catch((err: unknown) => {
      console.error("Failed to trigger ad-hoc run:", err);
    });
  }

  async function handleOpenRecentRun(recent: RecentRun): Promise<void> {
    if (!recent.projectId || !recent.suiteId) return;
    try {
      const projects = await api.projects.list();
      const foundProject = projects.find((candidate) => candidate.id === recent.projectId);
      if (!foundProject) return;
      const suites = await api.suites.listByProject(foundProject.id);
      const foundSuite = suites.find((candidate) => candidate.id === recent.suiteId);
      if (!foundSuite) return;
      setProject(foundProject);
      setSuite(foundSuite);
      setView("suite-detail");
    } catch (err) {
      console.error("Failed to open recent run:", err);
    }
  }

  const onProjectsTab = view === "projects" || view === "suites" || view === "suite-detail";

  const breadcrumb: string[] = ["Sentinel"];
  if (view === "dashboard") breadcrumb.push("Dashboard");
  if (onProjectsTab) breadcrumb.push("Projects");
  if (view === "suites" && project) breadcrumb.push(project.name);
  if (view === "suite-detail" && project && suite) breadcrumb.push(project.name, suite.name);
  if (view === "settings") breadcrumb.push("Settings");
  if (view === "adhoc") breadcrumb.push("New chat");

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
            className={`nav-item${view === "dashboard" ? " active" : ""}`}
            onClick={() => setView("dashboard")}
          >
            <span className="nav-item-icon">⌂</span> Dashboard
          </button>
          <button
            type="button"
            className={`nav-item${view === "adhoc" ? " active" : ""}`}
            onClick={() => setView("adhoc")}
          >
            <span className="nav-item-icon">+</span> New chat
          </button>
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
          <button type="button" className="theme-toggle" onClick={toggleTheme} aria-label="Toggle light/dark theme">
            {theme === "dark" ? "☾ Dark" : "☀ Light"}
          </button>
          <div className="sidebar-meta">
            <span>v{__APP_VERSION__}</span>
            <span className="sidebar-meta-sep">·</span>
            <span>⌘K for commands</span>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <div className="breadcrumb-bar">
          {breadcrumb.map((crumb, index) => (
            <span key={`${crumb}-${index}`} className="breadcrumb-item">
              {index > 0 && <span className="breadcrumb-sep">/</span>}
              {crumb}
            </span>
          ))}
          <button
            type="button"
            className={`preview-toggle${previewOpen ? " active" : ""}`}
            onClick={togglePreview}
            aria-label={previewOpen ? "Hide live preview" : "Show live preview"}
            aria-pressed={previewOpen}
          >
            ▣ Preview
          </button>
        </div>

        <div className="content-dock">
          <div className="content-container">
            {view === "dashboard" && (
              <DashboardView onGoToProjects={() => setView("projects")} onSelectRecentRun={handleOpenRecentRun} />
            )}

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

            {view === "adhoc" && (
              <AdHocView
                onTriggerRun={handleTriggerAdHocRun}
                activeRun={activeRun}
                activeRunSteps={activeRunSteps}
                pendingPrompt={pendingPrompt}
                onAnswerPrompt={handleAnswerPrompt}
              />
            )}
          </div>

          {previewOpen && (
            <>
              <div
                className="preview-resize-handle"
                onMouseDown={handlePreviewResizeStart}
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize live preview panel"
              />
              <div className="preview-dock-panel" style={{ width: previewWidth }}>
                <PreviewPanel
                  active={activeRun?.status === "running"}
                  runId={activeRun?.status === "running" ? activeRun.id : null}
                  frame={previewFrame}
                  url={previewUrl}
                  actionWarning={previewActionWarning}
                  send={send}
                />
              </div>
            </>
          )}
        </div>
      </main>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onGoToDashboard={() => setView("dashboard")}
        onGoToProjects={() => setView("projects")}
        onGoToSettings={() => setView("settings")}
        onGoToNewChat={() => setView("adhoc")}
        onSelectProject={(selected) => {
          setProject(selected);
          setView("suites");
        }}
      />

      {showOnboarding && (
        <OnboardingModal
          onGoToSettings={() => {
            dismissOnboarding();
            setView("settings");
          }}
          onDismiss={dismissOnboarding}
        />
      )}
    </div>
  );
}
