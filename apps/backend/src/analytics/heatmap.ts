import type { StepVerdict } from "@sentinel/shared";

export interface ModuleOutcome {
  module: string;
  subModule: string | null;
  verdict: StepVerdict;
}

export interface ModuleRisk {
  module: string;
  subModule: string | null;
  total: number;
  failCount: number;
  failRate: number;
}

/** Module/sub-module risk heatmap (design §5.10): groups case outcomes by
 * module+subModule and ranks by fail rate — highest risk first. */
export function computeModuleRiskHeatmap(outcomes: readonly ModuleOutcome[]): ModuleRisk[] {
  const groups = new Map<string, ModuleOutcome[]>();
  for (const outcome of outcomes) {
    const key = `${outcome.module}::${outcome.subModule ?? ""}`;
    const list = groups.get(key) ?? [];
    list.push(outcome);
    groups.set(key, list);
  }

  const results: ModuleRisk[] = [];
  for (const list of groups.values()) {
    const first = list[0];
    if (!first) {
      continue;
    }
    const failCount = list.filter((o) => o.verdict !== "pass").length;
    results.push({
      module: first.module,
      subModule: first.subModule,
      total: list.length,
      failCount,
      failRate: failCount / list.length,
    });
  }
  return results.sort((a, b) => b.failRate - a.failRate);
}
