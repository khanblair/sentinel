export type Provider = "claude" | "deepseek" | "gemini" | "openai" | "openrouter";

export type PreconditionType = "auto" | "manual";

export type RunMode = "interactive" | "full_auto";

export type RunTrigger = "manual" | "scheduled";

export type RunStatus =
  | "pending"
  | "running"
  | "passed"
  | "failed"
  | "blocked"
  | "cancelled";

export type StepVerdict = "pass" | "fail" | "blocked";

export type ScheduleType = "cron" | "interval" | "once";

/**
 * A model available from a provider, fetched live from that provider's own API
 * (never hardcoded — model IDs and availability change too often to bake in).
 * Fields beyond `id` are populated only when the provider's list-models response
 * actually includes them — never synthesized. A provider that returns bare IDs
 * (OpenAI, DeepSeek) legitimately has every field but `id` as `null`.
 */
export interface ModelInfo {
  id: string;
  label: string | null;
  description: string | null;
  contextWindow: number | null;
  supportsTools: boolean | null;
}

/** A single element found on a page — either from listElements (the action loop's
 * own DOM scan) or from the live preview's "select element" point-inspection. Both
 * describe the same shape so the renderer doesn't need two element-summary types. */
export interface ElementSummary {
  selector: string;
  role: string | null;
  text: string | null;
  ariaLabel: string | null;
  checked: boolean | null;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  defaultAssistantId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Suite {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TestCase {
  id: string;
  suiteId: string;
  module: string;
  subModule: string | null;
  title: string;
  priority: string;
  urlPath: string;
  precondition: string | null;
  preconditionType: PreconditionType;
  steps: string;
  expectedResult: string;
  tags: string[];
  owner: string | null;
  linkedIssueUrl: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Environment {
  id: string;
  projectId: string;
  name: string;
  baseUrl: string;
  credentialsProfile: Record<string, string> | null;
  createdAt: string;
}

/**
 * Every judgment carries confidence + evidence, not just pass/fail (design §6.2) —
 * defined at the schema level from day one so the action loop and DB never diverge.
 */
export interface StepLog {
  id: string;
  runId: string;
  testCaseId: string | null;
  stepIndex: number;
  toolCall: Record<string, unknown>;
  observation: string;
  verdict: StepVerdict;
  confidence: number;
  confidenceReason: string;
  createdAt: string;
}

export interface Run {
  id: string;
  suiteId: string | null;
  assistantId: string;
  environmentId: string | null;
  mode: RunMode;
  trigger: RunTrigger;
  status: RunStatus;
  startedAt: string;
  finishedAt: string | null;
}

export interface Assistant {
  id: string;
  name: string;
  systemPrompt: string;
  defaultSkills: string[];
  isBuiltIn: boolean;
  projectId: string | null;
}

export interface Skill {
  id: string;
  name: string;
  definition: string;
  isBuiltIn: boolean;
}

export interface Rule {
  id: string;
  scope: "global" | "project";
  projectId: string | null;
  text: string;
  createdAt: string;
}

export interface ProviderConfig {
  id: string;
  provider: Provider;
  label: string | null;
  createdAt: string;
}

export interface ProviderUsage {
  id: string;
  runId: string;
  provider: Provider;
  model: string;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number;
  createdAt: string;
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
