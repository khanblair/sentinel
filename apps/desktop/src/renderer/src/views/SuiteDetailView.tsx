import { useEffect, useState } from "react";
import type { Environment, Run, RunMode, StepLog, Suite, TestCase } from "@sentinel/shared";
import { api, type ProviderConfigSummary } from "../api/client";
import { RunTicker, type PendingPrompt } from "../components/RunTicker";

export interface SuiteDetailViewProps {
  suite: Suite;
  onBack: () => void;
  onTriggerRun: (input: {
    assistantId: string;
    environmentId?: string | null;
    mode: RunMode;
    providerConfigId: string;
    model: string;
  }) => void;
  activeRun: Run | null;
  activeRunSteps: StepLog[];
  pendingPrompt: PendingPrompt | null;
  onAnswerPrompt: (requestId: string, value: string | null) => void;
}

export function SuiteDetailView(props: SuiteDetailViewProps): JSX.Element {
  const { suite, onBack, onTriggerRun, activeRun, activeRunSteps, pendingPrompt, onAnswerPrompt } = props;

  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [environments, setEnvironments] = useState<Environment[]>([]);
  const [providerConfigs, setProviderConfigs] = useState<ProviderConfigSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [urlPath, setUrlPath] = useState("/");
  const [steps, setSteps] = useState("");
  const [expectedResult, setExpectedResult] = useState("");

  const [assistantId, setAssistantId] = useState("");
  const [environmentId, setEnvironmentId] = useState("");
  const [providerConfigId, setProviderConfigId] = useState("");
  const [model, setModel] = useState("");
  const [mode, setMode] = useState<RunMode>("interactive");

  async function refresh(): Promise<void> {
    try {
      const [cases, envs, providers] = await Promise.all([
        api.testCases.listBySuite(suite.id),
        api.environments.listByProject(suite.projectId),
        api.providerConfigs.list(),
      ]);
      setTestCases(cases);
      setEnvironments(envs);
      setProviderConfigs(providers);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suite.id]);

  async function handleCreateTestCase(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!title.trim() || !expectedResult.trim()) return;
    setError(null);
    try {
      await api.testCases.create(suite.id, {
        module: suite.name,
        title,
        priority: "P2",
        urlPath,
        steps,
        expectedResult,
      });
      setTitle("");
      setSteps("");
      setExpectedResult("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function handleTriggerRun(): void {
    if (!assistantId.trim() || !providerConfigId || !model.trim()) {
      setError("Assistant id, provider config, and model are all required to run.");
      return;
    }
    setError(null);
    onTriggerRun({
      assistantId,
      environmentId: environmentId || null,
      mode,
      providerConfigId,
      model,
    });
  }

  return (
    <section>
      <button type="button" onClick={onBack}>
        ← Suites
      </button>
      <h2>{suite.name}</h2>
      {error && <p role="alert">{error}</p>}

      <h3>Test cases</h3>
      <ul>
        {testCases.map((testCase) => (
          <li key={testCase.id}>
            <strong>{testCase.title}</strong> — {testCase.urlPath}
          </li>
        ))}
        {testCases.length === 0 && <li>No test cases yet.</li>}
      </ul>

      <form onSubmit={(event) => void handleCreateTestCase(event)}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" aria-label="Title" />
        <input value={urlPath} onChange={(e) => setUrlPath(e.target.value)} placeholder="/path" aria-label="URL path" />
        <textarea value={steps} onChange={(e) => setSteps(e.target.value)} placeholder="Steps" aria-label="Steps" />
        <textarea
          value={expectedResult}
          onChange={(e) => setExpectedResult(e.target.value)}
          placeholder="Expected result"
          aria-label="Expected result"
        />
        <button type="submit">Add test case</button>
      </form>

      <h3>Run this suite</h3>
      <div>
        <input
          value={assistantId}
          onChange={(e) => setAssistantId(e.target.value)}
          placeholder="Assistant id"
          aria-label="Assistant id"
        />
        <select value={environmentId} onChange={(e) => setEnvironmentId(e.target.value)} aria-label="Environment">
          <option value="">No environment</option>
          {environments.map((env) => (
            <option key={env.id} value={env.id}>
              {env.name} ({env.baseUrl})
            </option>
          ))}
        </select>
        <select
          value={providerConfigId}
          onChange={(e) => setProviderConfigId(e.target.value)}
          aria-label="Provider config"
        >
          <option value="">Select a provider…</option>
          {providerConfigs.map((config) => (
            <option key={config.id} value={config.id}>
              {config.provider} {config.label ? `(${config.label})` : ""}
            </option>
          ))}
        </select>
        <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model" aria-label="Model" />
        <select value={mode} onChange={(e) => setMode(e.target.value as RunMode)} aria-label="Run mode">
          <option value="interactive">Interactive</option>
          <option value="full_auto">Full-Auto</option>
        </select>
        <button type="button" onClick={handleTriggerRun}>
          Run suite
        </button>
      </div>

      <RunTicker
        run={activeRun}
        steps={activeRunSteps}
        pendingPrompt={pendingPrompt}
        onAnswerPrompt={onAnswerPrompt}
      />
    </section>
  );
}
