export interface ModelRate {
  promptPerMillionUsd: number;
  completionPerMillionUsd: number;
}

/**
 * Per-model USD rates, maintained by hand — intentionally empty until real, current
 * prices are confirmed and entered here. Never guess a number: an absent entry means
 * estimateCostUsd() returns null (unknown cost, correctly represented), rather than
 * a wrong cost presented as a known one.
 */
const MODEL_RATES: Record<string, ModelRate> = {};

export function estimateCostUsd(model: string, promptTokens: number, completionTokens: number): number | null {
  const rate = MODEL_RATES[model];
  if (!rate) {
    return null;
  }
  return (
    (promptTokens / 1_000_000) * rate.promptPerMillionUsd +
    (completionTokens / 1_000_000) * rate.completionPerMillionUsd
  );
}
