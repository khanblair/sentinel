import { useEffect, useState } from "react";
import type { Environment, RunMode, ScheduleType } from "@sentinel/shared";
import { api, type AssistantSummary, type ProviderConfigSummary, type ScheduledJob } from "../api/client";

export interface ScheduledJobsPanelProps {
  suiteId: string;
  assistants: AssistantSummary[];
  environments: Environment[];
  providerConfigs: ProviderConfigSummary[];
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function ScheduledJobsPanel({
  suiteId,
  assistants,
  environments,
  providerConfigs,
}: ScheduledJobsPanelProps): JSX.Element {
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [scheduleType, setScheduleType] = useState<ScheduleType>("interval");
  const [scheduleExpression, setScheduleExpression] = useState("");
  const [assistantId, setAssistantId] = useState("");
  const [environmentId, setEnvironmentId] = useState("");
  const [providerConfigId, setProviderConfigId] = useState("");
  const [model, setModel] = useState("");
  const [mode, setMode] = useState<RunMode>("full_auto");

  async function refresh(): Promise<void> {
    try {
      setJobs(await api.scheduledJobs.listBySuite(suiteId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suiteId]);

  async function handleCreate(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    if (!scheduleExpression.trim() || !assistantId || !providerConfigId || !model.trim()) {
      setError("Schedule expression, assistant, provider, and model are all required.");
      return;
    }
    setError(null);
    try {
      await api.scheduledJobs.create(suiteId, {
        scheduleType,
        scheduleExpression,
        mode,
        assistantId,
        providerConfigId,
        model,
        environmentId: environmentId || null,
      });
      setScheduleExpression("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleToggle(job: ScheduledJob): Promise<void> {
    try {
      await api.scheduledJobs.setActive(job.id, !job.isActive);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleDelete(id: string): Promise<void> {
    try {
      await api.scheduledJobs.remove(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <>
      <h3>Scheduled jobs</h3>
      {error && <p role="alert">{error}</p>}

      <ul className="item-list">
        {jobs.map((job) => (
          <li key={job.id} className="item-row">
            <div className="item-row-main">
              <span className="item-title-btn item-title-static">
                {job.scheduleType}: {job.scheduleExpression}
              </span>
              <span className="item-subtext">
                Next run {formatTimestamp(job.nextRunAt)}
                {job.lastRunAt ? ` · last run ${formatTimestamp(job.lastRunAt)}` : ""}
              </span>
            </div>
            <div className="field-row">
              <span className={job.isActive ? "badge badge-pass" : "badge badge-neutral"}>
                {job.isActive ? "active" : "paused"}
              </span>
              <button type="button" className="btn btn-sm" onClick={() => void handleToggle(job)}>
                {job.isActive ? "Pause" : "Resume"}
              </button>
              <button type="button" className="btn btn-sm btn-danger" onClick={() => void handleDelete(job.id)}>
                Delete
              </button>
            </div>
          </li>
        ))}
        {jobs.length === 0 && <li className="empty-state">No scheduled jobs yet — create one below.</li>}
      </ul>

      <form className="field-row" onSubmit={(event) => void handleCreate(event)}>
        <select value={scheduleType} onChange={(e) => setScheduleType(e.target.value as ScheduleType)} aria-label="Schedule type">
          <option value="interval">Interval</option>
          <option value="cron">Cron</option>
          <option value="once">Once</option>
        </select>
        <input
          value={scheduleExpression}
          onChange={(e) => setScheduleExpression(e.target.value)}
          placeholder={scheduleType === "cron" ? "0 9 * * *" : scheduleType === "interval" ? "3600000 (ms)" : "ISO timestamp"}
          aria-label="Schedule expression"
        />
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
              {env.name}
            </option>
          ))}
        </select>
        <select value={providerConfigId} onChange={(e) => setProviderConfigId(e.target.value)} aria-label="Provider config">
          <option value="">Select a provider…</option>
          {providerConfigs.map((config) => (
            <option key={config.id} value={config.id}>
              {config.provider} {config.label ? `(${config.label})` : ""}
            </option>
          ))}
        </select>
        <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model" aria-label="Model" />
        <select value={mode} onChange={(e) => setMode(e.target.value as RunMode)} aria-label="Run mode">
          <option value="full_auto">Full-Auto</option>
          <option value="interactive">Interactive</option>
        </select>
        <button type="submit" className="btn btn-primary">
          Create schedule
        </button>
      </form>
    </>
  );
}
