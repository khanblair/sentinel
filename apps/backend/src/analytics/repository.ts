import type { PrismaClient } from "@prisma/client";
import type { StepVerdict } from "@sentinel/shared";
import { rankFlakyCases, type CaseRunOutcome, type FlakyCase } from "./flakiness.js";
import { computeModuleRiskHeatmap, type ModuleRisk } from "./heatmap.js";

const VERDICT_SEVERITY: Record<StepVerdict, number> = { pass: 0, blocked: 1, fail: 2 };

function worstVerdict(verdicts: readonly StepVerdict[]): StepVerdict {
  return verdicts.reduce((worst, v) => (VERDICT_SEVERITY[v] > VERDICT_SEVERITY[worst] ? v : worst), "pass" as StepVerdict);
}

export interface RunTrendPoint {
  runId: string;
  status: string;
  trigger: string;
  startedAt: Date;
  finishedAt: Date | null;
}

export interface UsageByProviderModel {
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  estimatedCostUsd: number | null;
  runCount: number;
}

export interface RecentRun {
  runId: string;
  status: string;
  trigger: string;
  startedAt: Date;
  finishedAt: Date | null;
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
  startedAt: Date;
  finishedAt: Date | null;
  suiteId: string | null;
  suiteName: string | null;
  steps: RunStepDetail[];
}

/** Read-only aggregation over Run/StepLog/ProviderUsage (design §5.10) — everything
 * here reads from data written by runSuite (Phase 4a's usage plumbing, Phase 3b's
 * Run/StepLog persistence); nothing in this file writes anything. */
export class AnalyticsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async passFailTrend(suiteId: string): Promise<RunTrendPoint[]> {
    const runs = await this.prisma.run.findMany({
      where: { suiteId },
      orderBy: { startedAt: "asc" },
      select: { id: true, status: true, trigger: true, startedAt: true, finishedAt: true },
    });
    return runs.map((run) => ({
      runId: run.id,
      status: run.status,
      trigger: run.trigger,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
    }));
  }

  async flakyCases(suiteId: string): Promise<FlakyCase[]> {
    const stepLogs = await this.prisma.stepLog.findMany({
      where: { run: { suiteId }, testCaseId: { not: null } },
      select: { testCaseId: true, verdict: true, run: { select: { id: true, startedAt: true } } },
    });

    const byRunAndCase = new Map<string, { testCaseId: string; runId: string; startedAt: Date; verdicts: StepVerdict[] }>();
    for (const log of stepLogs) {
      if (!log.testCaseId) continue;
      const key = `${log.run.id}::${log.testCaseId}`;
      const entry = byRunAndCase.get(key);
      if (entry) {
        entry.verdicts.push(log.verdict as StepVerdict);
      } else {
        byRunAndCase.set(key, {
          testCaseId: log.testCaseId,
          runId: log.run.id,
          startedAt: log.run.startedAt,
          verdicts: [log.verdict as StepVerdict],
        });
      }
    }

    const outcomes: CaseRunOutcome[] = Array.from(byRunAndCase.values()).map((entry) => ({
      testCaseId: entry.testCaseId,
      runId: entry.runId,
      startedAt: entry.startedAt,
      verdict: worstVerdict(entry.verdicts),
    }));

    return rankFlakyCases(outcomes);
  }

  async moduleRiskHeatmap(projectId: string): Promise<ModuleRisk[]> {
    const stepLogs = await this.prisma.stepLog.findMany({
      where: { run: { suite: { projectId } }, testCaseId: { not: null } },
      select: {
        verdict: true,
        testCase: { select: { module: true, subModule: true } },
      },
    });

    const outcomes = stepLogs
      .filter((log) => log.testCase)
      .map((log) => ({
        module: log.testCase!.module,
        subModule: log.testCase!.subModule,
        verdict: log.verdict as StepVerdict,
      }));

    return computeModuleRiskHeatmap(outcomes);
  }

  /** Cross-project run feed for the Dashboard home screen — the only query in this
   * file that isn't scoped to a single suite/project. */
  async recentRuns(limit = 10): Promise<RecentRun[]> {
    const runs = await this.prisma.run.findMany({
      orderBy: { startedAt: "desc" },
      take: limit,
      select: {
        id: true,
        status: true,
        trigger: true,
        startedAt: true,
        finishedAt: true,
        suite: { select: { id: true, name: true, project: { select: { id: true, name: true } } } },
      },
    });
    return runs.map((run) => ({
      runId: run.id,
      status: run.status,
      trigger: run.trigger,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      suiteId: run.suite?.id ?? null,
      suiteName: run.suite?.name ?? null,
      projectId: run.suite?.project.id ?? null,
      projectName: run.suite?.project.name ?? null,
    }));
  }

  async totalRunCount(): Promise<number> {
    return this.prisma.run.count();
  }

  /** Suite-scoped run history for browsing past runs (distinct from passFailTrend,
   * which is shaped for the trend chart and ordered oldest-first). */
  async runsBySuite(suiteId: string): Promise<RecentRun[]> {
    const runs = await this.prisma.run.findMany({
      where: { suiteId },
      orderBy: { startedAt: "desc" },
      select: {
        id: true,
        status: true,
        trigger: true,
        startedAt: true,
        finishedAt: true,
        suite: { select: { id: true, name: true, project: { select: { id: true, name: true } } } },
      },
    });
    return runs.map((run) => ({
      runId: run.id,
      status: run.status,
      trigger: run.trigger,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      suiteId: run.suite?.id ?? null,
      suiteName: run.suite?.name ?? null,
      projectId: run.suite?.project.id ?? null,
      projectName: run.suite?.project.name ?? null,
    }));
  }

  async runDetail(runId: string): Promise<RunDetail | null> {
    const run = await this.prisma.run.findUnique({
      where: { id: runId },
      select: {
        id: true,
        status: true,
        trigger: true,
        startedAt: true,
        finishedAt: true,
        suite: { select: { id: true, name: true } },
      },
    });
    if (!run) return null;

    const stepLogs = await this.prisma.stepLog.findMany({
      where: { runId },
      orderBy: { stepIndex: "asc" },
      select: {
        id: true,
        stepIndex: true,
        testCaseId: true,
        toolCall: true,
        observation: true,
        verdict: true,
        confidence: true,
        confidenceReason: true,
      },
    });

    return {
      runId: run.id,
      status: run.status,
      trigger: run.trigger,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      suiteId: run.suite?.id ?? null,
      suiteName: run.suite?.name ?? null,
      steps: stepLogs.map((log) => ({
        id: log.id,
        stepIndex: log.stepIndex,
        testCaseId: log.testCaseId,
        toolCall: JSON.parse(log.toolCall) as Record<string, unknown>,
        observation: log.observation,
        verdict: log.verdict,
        confidence: log.confidence,
        confidenceReason: log.confidenceReason,
      })),
    };
  }

  async usageBySuite(suiteId: string): Promise<UsageByProviderModel[]> {
    const rows = await this.prisma.providerUsage.groupBy({
      by: ["provider", "model"],
      where: { run: { suiteId } },
      _sum: { promptTokens: true, completionTokens: true, estimatedCostUsd: true },
      _count: { _all: true },
    });
    return rows.map((row) => ({
      provider: row.provider,
      model: row.model,
      promptTokens: row._sum.promptTokens ?? 0,
      completionTokens: row._sum.completionTokens ?? 0,
      estimatedCostUsd: row._sum.estimatedCostUsd,
      runCount: row._count._all,
    }));
  }
}
