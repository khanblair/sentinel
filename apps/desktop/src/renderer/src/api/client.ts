import type { Environment, Project, Provider, RunMode, Suite, TestCase } from "@sentinel/shared";

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
    headers: { "Content-Type": "application/json", ...init?.headers },
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
  isBuiltIn: boolean;
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

export const api = {
  assistants: {
    list: () => request<AssistantSummary[]>("/api/assistants"),
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
  },
  environments: {
    listByProject: (projectId: string) => request<Environment[]>(`/api/projects/${projectId}/environments`),
    create: (projectId: string, input: { name: string; baseUrl: string }) =>
      request<Environment>(`/api/projects/${projectId}/environments`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
  },
  providerConfigs: {
    list: () => request<ProviderConfigSummary[]>("/api/provider-configs"),
    create: (input: { provider: Provider; apiKey: string; label?: string | null }) =>
      request<ProviderConfigSummary>("/api/provider-configs", { method: "POST", body: JSON.stringify(input) }),
    remove: (id: string) => request<void>(`/api/provider-configs/${id}`, { method: "DELETE" }),
  },
  runs: {
    trigger: (suiteId: string, input: RunTriggerInput) =>
      request<{ runId: string; status: string }>(`/api/suites/${suiteId}/run`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    recent: (limit = 10) => request<RecentRun[]>(`/api/runs/recent?limit=${limit}`),
  },
};
