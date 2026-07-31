import type { Environment, Project, Provider, Rule, RunMode, ScheduleType, Skill, Suite, TestCase } from "@sentinel/shared";

const FALLBACK_BACKEND_URL = "http://127.0.0.1:4317";

export function backendHttpUrl(): string {
  return window.sentinel?.getBackendUrl() ?? FALLBACK_BACKEND_URL;
}

export function backendWsUrl(): string {
  return `${backendHttpUrl().replace(/^http/, "ws")}/ws`;
}

interface ApiErrorBody {
  status?: string;
  message?: string;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${backendHttpUrl()}${path}`, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init?.headers } : init?.headers,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
    throw new Error(body.message ?? `Request failed with status ${response.status}`);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export interface ProviderConfigSummary {
  id: string;
  provider: Provider;
  label: string | null;
  createdAt: string;
}

export interface AssistantSummary {
  id: string;
  name: string;
  systemPrompt: string;
  defaultSkills: string[];
  isBuiltIn: boolean;
  projectId: string | null;
}

export interface RunTriggerInput {
  assistantId: string;
  environmentId?: string | null;
  mode: RunMode;
  providerConfigId: string;
  model: string;
}

export interface RecentRun {
  runId: string;
  status: string;
  trigger: string;
  startedAt: string;
  finishedAt: string | null;
  suiteId: string | null;
  suiteName: string | null;
  projectId: string | null;
  projectName: string | null;
}

export interface RunStepDetail {
  id: string;
  stepIndex: number;
  testCaseId: string | null;
  toolCall: Record<string, unknown>;
  observation: string;
  verdict: string;
  confidence: number;
  confidenceReason: string;
}

export interface RunDetail {
  runId: string;
  status: string;
  trigger: string;
  startedAt: string;
  finishedAt: string | null;
  suiteId: string | null;
  suiteName: string | null;
  steps: RunStepDetail[];
}

export interface RunTrendPoint {
  runId: string;
  status: string;
  trigger: string;
  startedAt: string;
  finishedAt: string | null;
}

export interface FlakyCase {
  testCaseId: string;
  flipCount: number;
  recentVerdicts: string[];
}

export interface UsageByProviderModel {
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number | null;
  runCount: number;
}

export interface ModuleRisk {
  module: string;
  subModule: string | null;
  total: number;
  failCount: number;
  failRate: number;
}

export interface ScheduledJob {
  id: string;
  suiteId: string | null;
  scheduleType: ScheduleType;
  scheduleExpression: string;
  timezone: string;
  mode: RunMode;
  nextRunAt: string;
  lastRunAt: string | null;
  isActive: boolean;
}

export interface ScheduledJobInput {
  scheduleType: ScheduleType;
  scheduleExpression: string;
  timezone?: string;
  mode?: RunMode;
  assistantId: string;
  providerConfigId: string;
  model: string;
  environmentId?: string | null;
}

export const api = {
  assistants: {
    list: () => request<AssistantSummary[]>("/api/assistants"),
    create: (input: { name: string; systemPrompt: string; defaultSkills?: string[]; projectId?: string | null }) =>
      request<AssistantSummary>("/api/assistants", { method: "POST", body: JSON.stringify(input) }),
    remove: (id: string) => request<void>(`/api/assistants/${id}`, { method: "DELETE" }),
  },
  projects: {
    list: () => request<Project[]>("/api/projects"),
    create: (input: { name: string; description?: string | null }) =>
      request<Project>("/api/projects", { method: "POST", body: JSON.stringify(input) }),
    remove: (id: string) => request<void>(`/api/projects/${id}`, { method: "DELETE" }),
  },
  suites: {
    listByProject: (projectId: string) => request<Suite[]>(`/api/projects/${projectId}/suites`),
    create: (projectId: string, input: { name: string; description?: string | null }) =>
      request<Suite>(`/api/projects/${projectId}/suites`, { method: "POST", body: JSON.stringify(input) }),
    archive: (id: string) => request<Suite>(`/api/suites/${id}/archive`, { method: "POST" }),
    clone: (id: string) => request<Suite>(`/api/suites/${id}/clone`, { method: "POST" }),
  },
  testCases: {
    listBySuite: (suiteId: string) => request<TestCase[]>(`/api/suites/${suiteId}/test-cases`),
    create: (
      suiteId: string,
      input: {
        module: string;
        title: string;
        priority: string;
        urlPath: string;
        steps: string;
        expectedResult: string;
        tags?: string[];
      },
    ) => request<TestCase>(`/api/suites/${suiteId}/test-cases`, { method: "POST", body: JSON.stringify(input) }),
    archive: (id: string) => request<TestCase>(`/api/test-cases/${id}/archive`, { method: "POST" }),
    clone: (id: string) => request<TestCase>(`/api/test-cases/${id}/clone`, { method: "POST" }),
    importCsv: (suiteId: string, csv: string) =>
      request<{ imported: number; errors: Array<{ line: number; message: string }> }>(
        `/api/suites/${suiteId}/test-cases/import`,
        { method: "POST", body: JSON.stringify({ csv }) },
      ),
  },
  environments: {
    listByProject: (projectId: string) => request<Environment[]>(`/api/projects/${projectId}/environments`),
    create: (projectId: string, input: { name: string; baseUrl: string }) =>
      request<Environment>(`/api/projects/${projectId}/environments`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    remove: (id: string) => request<void>(`/api/environments/${id}`, { method: "DELETE" }),
  },
  rules: {
    listGlobal: () => request<Rule[]>("/api/rules"),
    listByProject: (projectId: string) => request<Rule[]>(`/api/projects/${projectId}/rules`),
    create: (input: { scope: "global" | "project"; projectId?: string | null; text: string }) =>
      request<Rule>("/api/rules", { method: "POST", body: JSON.stringify(input) }),
    remove: (id: string) => request<void>(`/api/rules/${id}`, { method: "DELETE" }),
  },
  skills: {
    list: () => request<Skill[]>("/api/skills"),
    create: (input: { name: string; definition: string }) =>
      request<Skill>("/api/skills", { method: "POST", body: JSON.stringify(input) }),
    remove: (id: string) => request<void>(`/api/skills/${id}`, { method: "DELETE" }),
  },
  providerConfigs: {
    list: () => request<ProviderConfigSummary[]>("/api/provider-configs"),
    create: (input: { provider: Provider; apiKey: string; label?: string | null }) =>
      request<ProviderConfigSummary>("/api/provider-configs", { method: "POST", body: JSON.stringify(input) }),
    remove: (id: string) => request<void>(`/api/provider-configs/${id}`, { method: "DELETE" }),
    test: (id: string) => request<{ ok: boolean; message: string }>(`/api/provider-configs/${id}/test`, { method: "POST" }),
  },
  scheduledJobs: {
    listBySuite: (suiteId: string) => request<ScheduledJob[]>(`/api/suites/${suiteId}/scheduled-jobs`),
    create: (suiteId: string, input: ScheduledJobInput) =>
      request<ScheduledJob>(`/api/suites/${suiteId}/scheduled-jobs`, { method: "POST", body: JSON.stringify(input) }),
    setActive: (id: string, isActive: boolean) =>
      request<ScheduledJob>(`/api/scheduled-jobs/${id}/active`, {
        method: "POST",
        body: JSON.stringify({ isActive }),
      }),
    remove: (id: string) => request<void>(`/api/scheduled-jobs/${id}`, { method: "DELETE" }),
  },
  runs: {
    trigger: (suiteId: string, input: RunTriggerInput) =>
      request<{ runId: string; status: string }>(`/api/suites/${suiteId}/run`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    recent: (limit = 10) => request<RecentRun[]>(`/api/runs/recent?limit=${limit}`),
    count: () => request<{ count: number }>("/api/runs/count"),
    historyForSuite: (suiteId: string) => request<RecentRun[]>(`/api/suites/${suiteId}/runs`),
    detail: (runId: string) => request<RunDetail>(`/api/runs/${runId}`),
    report: async (runId: string, format: "markdown" | "csv"): Promise<string> => {
      const response = await fetch(`${backendHttpUrl()}/api/runs/${runId}/report?format=${format}`);
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as ApiErrorBody;
        throw new Error(body.message ?? `Request failed with status ${response.status}`);
      }
      return response.text();
    },
  },
  analytics: {
    trend: (suiteId: string) => request<RunTrendPoint[]>(`/api/suites/${suiteId}/analytics/trend`),
    flakyCases: (suiteId: string) => request<FlakyCase[]>(`/api/suites/${suiteId}/analytics/flaky-cases`),
    usage: (suiteId: string) => request<UsageByProviderModel[]>(`/api/suites/${suiteId}/analytics/usage`),
    heatmap: (projectId: string) => request<ModuleRisk[]>(`/api/projects/${projectId}/analytics/heatmap`),
  },
  adhoc: {
    generateChecklist: (input: {
      url: string;
      instruction: string;
      assistantId: string;
      providerConfigId: string;
      model: string;
    }) => request<{ steps: string[] }>("/api/adhoc/checklist", { method: "POST", body: JSON.stringify(input) }),
    run: (input: {
      url: string;
      checklist: string[];
      assistantId: string;
      mode: RunMode;
      providerConfigId: string;
      model: string;
    }) => request<{ runId: string; status: string }>("/api/adhoc/run", { method: "POST", body: JSON.stringify(input) }),
  },
};
