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
