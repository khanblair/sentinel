import { useEffect, useState } from "react";
import type { Environment, Run, RunMode, StepLog, Suite, TestCase } from "@sentinel/shared";
import { api, type AssistantSummary, type ProviderConfigSummary } from "../api/client";
import { RunTicker, type PendingPrompt } from "../components/RunTicker";
import { RunHistoryPanel } from "../components/RunHistoryPanel";
import { AnalyticsPanel } from "../components/AnalyticsPanel";
import { ScheduledJobsPanel } from "../components/ScheduledJobsPanel";
import { ModelSelect } from "../components/ModelSelect";

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
  const [assistants, setAssistants] = useState<AssistantSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [urlPath, setUrlPath] = useState("/");
  const [steps, setSteps] = useState("");
  const [expectedResult, setExpectedResult] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [linkedIssueUrlInput, setLinkedIssueUrlInput] = useState("");

  const [activeTagFilters, setActiveTagFilters] = useState<string[]>([]);

  const [editingLinkedIssueId, setEditingLinkedIssueId] = useState<string | null>(null);
  const [editingLinkedIssueValue, setEditingLinkedIssueValue] = useState("");

  const [importSummary, setImportSummary] = useState<{
    imported: number;
    errors: Array<{ line: number; message: string }>;
  } | null>(null);
  const [importing, setImporting] = useState(false);

  const [assistantId, setAssistantId] = useState("");
  const [environmentId, setEnvironmentId] = useState("");
  const [providerConfigId, setProviderConfigId] = useState("");
  const [model, setModel] = useState("");
  const [mode, setMode] = useState<RunMode>("interactive");

  async function refresh(): Promise<void> {
    try {
      const [cases, envs, providers, assistantList] = await Promise.all([
        api.testCases.listBySuite(suite.id),
        api.environments.listByProject(suite.projectId),
        api.providerConfigs.list(),
        api.assistants.list(),
      ]);
      setTestCases(cases);
      setEnvironments(envs);
      setProviderConfigs(providers);
      setAssistants(assistantList);
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
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      await api.testCases.create(suite.id, {
        module: suite.name,
        title,
        priority: "P2",
        urlPath,
        steps,
        expectedResult,
        tags: tags.length > 0 ? tags : undefined,
        linkedIssueUrl: linkedIssueUrlInput.trim() || undefined,
      });
      setTitle("");
      setSteps("");
      setExpectedResult("");
      setTagsInput("");
      setLinkedIssueUrlInput("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleImportCsv(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    setImportSummary(null);
    setImporting(true);
    try {
      const csvText = await file.text();
      const summary = await api.testCases.importCsv(suite.id, csvText);
      setImportSummary(summary);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  }

  async function handleArchiveTestCase(id: string): Promise<void> {
    try {
      await api.testCases.archive(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleCloneTestCase(id: string): Promise<void> {
    try {
      await api.testCases.clone(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function startEditingLinkedIssue(testCase: TestCase): void {
    setEditingLinkedIssueId(testCase.id);
    setEditingLinkedIssueValue(testCase.linkedIssueUrl ?? "");
  }

  async function saveLinkedIssue(id: string): Promise<void> {
    try {
      await api.testCases.update(id, { linkedIssueUrl: editingLinkedIssueValue.trim() || null });
      setEditingLinkedIssueId(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function toggleTagFilter(tag: string): void {
    setActiveTagFilters((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
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

  const allTags = Array.from(new Set(testCases.flatMap((tc) => tc.tags))).sort();
  const visibleTestCases =
    activeTagFilters.length === 0
      ? testCases
      : testCases.filter((tc) => activeTagFilters.every((tag) => tc.tags.includes(tag)));

  return (
    <section>
      <button type="button" className="back-link" onClick={onBack}>
        ← Suites
      </button>
      <h2>{suite.name}</h2>
      {error && <p role="alert">{error}</p>}

      <h3>Test cases</h3>
      {allTags.length > 0 && (
        <div className="tag-filter-row">
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              className={`tag-chip${activeTagFilters.includes(tag) ? " active" : ""}`}
              onClick={() => toggleTagFilter(tag)}
            >
              {tag}
            </button>
          ))}
          {activeTagFilters.length > 0 && (
            <button type="button" className="tag-chip-clear" onClick={() => setActiveTagFilters([])}>
              Clear filter
            </button>
          )}
        </div>
      )}
      <ul className="item-list">
        {visibleTestCases.map((testCase) => (
          <li key={testCase.id} className="item-row">
            <div className="item-row-main">
              <span className="item-title-btn item-title-static">{testCase.title}</span>
              <span className="item-subtext">
                {testCase.urlPath}
                {testCase.tags.length > 0 && ` · ${testCase.tags.join(", ")}`}
              </span>
              {editingLinkedIssueId === testCase.id ? (
                <div className="field-row">
                  <input
                    value={editingLinkedIssueValue}
                    onChange={(e) => setEditingLinkedIssueValue(e.target.value)}
                    placeholder="https://github.com/org/repo/issues/123"
                    aria-label={`Linked issue URL for ${testCase.title}`}
                  />
                  <button type="button" className="btn btn-sm" onClick={() => void saveLinkedIssue(testCase.id)}>
                    Save
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => setEditingLinkedIssueId(null)}>
                    Cancel
                  </button>
                </div>
              ) : testCase.linkedIssueUrl ? (
                <div className="field-row">
                  <a href={testCase.linkedIssueUrl} target="_blank" rel="noopener noreferrer" className="item-subtext">
                    🔗 {testCase.linkedIssueUrl}
                  </a>
                  <button type="button" className="btn btn-sm" onClick={() => startEditingLinkedIssue(testCase)}>
                    Edit link
                  </button>
                </div>
              ) : (
                <button type="button" className="btn btn-sm" onClick={() => startEditingLinkedIssue(testCase)}>
                  Link issue
                </button>
              )}
            </div>
            <div className="field-row">
              <button type="button" className="btn btn-sm" onClick={() => void handleCloneTestCase(testCase.id)}>
                Clone
              </button>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={() => void handleArchiveTestCase(testCase.id)}
              >
                Archive
              </button>
            </div>
          </li>
        ))}
        {testCases.length === 0 && <li className="empty-state">No test cases yet — add one below.</li>}
        {testCases.length > 0 && visibleTestCases.length === 0 && (
          <li className="empty-state">No test cases match the selected tags.</li>
        )}
      </ul>

      <form className="field-stack" onSubmit={(event) => void handleCreateTestCase(event)}>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" aria-label="Title" />
        <input value={urlPath} onChange={(e) => setUrlPath(e.target.value)} placeholder="/path" aria-label="URL path" />
        <textarea value={steps} onChange={(e) => setSteps(e.target.value)} placeholder="Steps" aria-label="Steps" />
        <textarea
          value={expectedResult}
          onChange={(e) => setExpectedResult(e.target.value)}
          placeholder="Expected result"
          aria-label="Expected result"
        />
        <input
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="Tags (comma-separated, e.g. smoke, regression)"
          aria-label="Tags"
        />
        <input
          value={linkedIssueUrlInput}
          onChange={(e) => setLinkedIssueUrlInput(e.target.value)}
          placeholder="Linked issue URL (optional)"
          aria-label="Linked issue URL"
        />
        <button type="submit" className="btn btn-primary">
          Add test case
        </button>
      </form>

      <div className="field-row">
        <label className="btn btn-sm">
          {importing ? "Importing…" : "Import CSV"}
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(event) => void handleImportCsv(event)}
            disabled={importing}
            className="visually-hidden-file-input"
            aria-label="Import test cases from CSV"
          />
        </label>
        <span className="item-subtext">
          Required columns: module, title, priority, urlPath, steps, expectedResult
        </span>
      </div>
      {importSummary && (
        <p className="item-subtext">
          Imported {importSummary.imported} test case{importSummary.imported === 1 ? "" : "s"}.
          {importSummary.errors.length > 0 && (
            <>
              {" "}
              {importSummary.errors.length} row{importSummary.errors.length === 1 ? "" : "s"} skipped:{" "}
              {importSummary.errors.map((e) => `line ${e.line} (${e.message})`).join("; ")}
            </>
          )}
        </p>
      )}

      <h3>Run this suite</h3>
      <div className="field-row">
        <select value={assistantId} onChange={(e) => setAssistantId(e.target.value)} aria-label="Assistant">
          <option value="">Select an assistant…</option>
          {assistants.map((assistant) => (
            <option key={assistant.id} value={assistant.id}>
              {assistant.name}
            </option>
          ))}
        </select>
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
        <button type="button" className="btn btn-primary" onClick={handleTriggerRun}>
          Run suite
        </button>
      </div>

      <RunTicker
        run={activeRun}
        steps={activeRunSteps}
        pendingPrompt={pendingPrompt}
        onAnswerPrompt={onAnswerPrompt}
      />

      <RunHistoryPanel suiteId={suite.id} />
      <AnalyticsPanel suiteId={suite.id} />
      <ScheduledJobsPanel
        suiteId={suite.id}
        assistants={assistants}
        environments={environments}
        providerConfigs={providerConfigs}
      />
    </section>
  );
}
