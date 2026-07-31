import { useEffect, useState } from "react";
import type { Run, RunMode, StepLog } from "@sentinel/shared";
import { api, type AssistantSummary, type ProviderConfigSummary } from "../api/client";
import { RunTicker, type PendingPrompt } from "../components/RunTicker";
import { ModelSelect } from "../components/ModelSelect";

export interface AdHocViewProps {
  onTriggerRun: (input: {
    url: string;
    checklist: string[];
    assistantId: string;
    mode: RunMode;
    providerConfigId: string;
    model: string;
  }) => void;
  activeRun: Run | null;
  activeRunSteps: StepLog[];
  pendingPrompt: PendingPrompt | null;
  onAnswerPrompt: (requestId: string, value: string | null) => void;
}

type Stage = "input" | "approve";

export function AdHocView({
  onTriggerRun,
  activeRun,
  activeRunSteps,
  pendingPrompt,
  onAnswerPrompt,
}: AdHocViewProps): JSX.Element {
  const [stage, setStage] = useState<Stage>("input");
  const [assistants, setAssistants] = useState<AssistantSummary[]>([]);
  const [providerConfigs, setProviderConfigs] = useState<ProviderConfigSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const [url, setUrl] = useState("");
  const [instruction, setInstruction] = useState("");
  const [assistantId, setAssistantId] = useState("");
  const [providerConfigId, setProviderConfigId] = useState("");
  const [model, setModel] = useState("");
  const [mode, setMode] = useState<RunMode>("interactive");

  const [checklist, setChecklist] = useState<string[]>([]);
  const [hasStartedRun, setHasStartedRun] = useState(false);

  useEffect(() => {
    async function load(): Promise<void> {
      try {
        const [assistantList, providerList] = await Promise.all([api.assistants.list(), api.providerConfigs.list()]);
        setAssistants(assistantList);
        setProviderConfigs(providerList);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
    void load();
  }, []);

  async function handleGenerate(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!url.trim() || !instruction.trim() || !assistantId || !providerConfigId || !model.trim()) {
      setError("URL, instruction, assistant, provider, and model are all required.");
      return;
    }
    setError(null);
    setGenerating(true);
    try {
      const result = await api.adhoc.generateChecklist({ url, instruction, assistantId, providerConfigId, model });
      setChecklist(result.steps);
      setStage("approve");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  }

  function updateStep(index: number, value: string): void {
    setChecklist((prev) => prev.map((step, i) => (i === index ? value : step)));
  }

  function removeStep(index: number): void {
    setChecklist((prev) => prev.filter((_, i) => i !== index));
  }

  function addStep(): void {
    setChecklist((prev) => [...prev, ""]);
  }

  function handleRun(): void {
    const steps = checklist.map((s) => s.trim()).filter(Boolean);
    if (steps.length === 0) {
      setError("The checklist needs at least one step.");
      return;
    }
    setError(null);
    setHasStartedRun(true);
    onTriggerRun({ url, checklist: steps, assistantId, mode, providerConfigId, model });
  }

  function handleStartOver(): void {
    setStage("input");
    setChecklist([]);
    setHasStartedRun(false);
  }

  return (
    <section>
      <h2>New chat</h2>
      <p className="item-subtext">
        Paste a URL and describe what to test — the agent proposes a checklist for you to review before anything runs.
      </p>
      {error && <p role="alert">{error}</p>}

      {stage === "input" && (
        <form className="field-stack" onSubmit={(event) => void handleGenerate(event)}>
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/checkout"
            aria-label="URL to test"
          />
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="What do you want tested? e.g. test the checkout flow, focus on validation errors"
            aria-label="Testing instruction"
          />
          <div className="field-row">
            <select value={assistantId} onChange={(e) => setAssistantId(e.target.value)} aria-label="Assistant">
              <option value="">Select an assistant…</option>
              {assistants.map((assistant) => (
                <option key={assistant.id} value={assistant.id}>
                  {assistant.name}
                </option>
              ))}
            </select>
            <select
              value={providerConfigId}
              onChange={(e) => {
                setProviderConfigId(e.target.value);
                setModel("");
              }}
              aria-label="Provider config"
            >
              <option value="">Select a provider…</option>
              {providerConfigs.map((config) => (
                <option key={config.id} value={config.id}>
                  {config.provider} {config.label ? `(${config.label})` : ""}
                </option>
              ))}
            </select>
            <ModelSelect providerConfigId={providerConfigId} value={model} onChange={setModel} />
            <select value={mode} onChange={(e) => setMode(e.target.value as RunMode)} aria-label="Run mode">
              <option value="interactive">Interactive</option>
              <option value="full_auto">Full-Auto</option>
            </select>
          </div>
          <button type="submit" className="btn btn-primary" disabled={generating}>
            {generating ? "Generating checklist…" : "Generate checklist"}
          </button>
        </form>
      )}

      {stage === "approve" && (
        <>
          <h3>Review the checklist</h3>
          <p className="item-subtext">Edit or remove any step before running. Nothing runs until you click Run.</p>
          <ol className="step-list">
            {checklist.map((step, index) => (
              <li key={index} className="step-item">
                <div className="field-row">
                  <input
                    value={step}
                    onChange={(e) => updateStep(index, e.target.value)}
                    aria-label={`Checklist step ${index + 1}`}
                    disabled={hasStartedRun}
                  />
                  {!hasStartedRun && (
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => removeStep(index)}>
                      Remove
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
          {!hasStartedRun && (
            <div className="field-row">
              <button type="button" className="btn btn-sm" onClick={addStep}>
                + Add step
              </button>
              <button type="button" className="btn" onClick={handleStartOver}>
                Start over
              </button>
              <button type="button" className="btn btn-primary" onClick={handleRun}>
                Run
              </button>
            </div>
          )}

          {hasStartedRun && (
            <RunTicker
              run={activeRun}
              steps={activeRunSteps}
              pendingPrompt={pendingPrompt}
              onAnswerPrompt={onAnswerPrompt}
            />
          )}
          {hasStartedRun && activeRun?.status && activeRun.status !== "running" && (
            <button type="button" className="btn" onClick={handleStartOver}>
              Start a new chat
            </button>
          )}
        </>
      )}
    </section>
  );
}
