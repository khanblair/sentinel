import type { StepVerdict } from "@sentinel/shared";

export interface ReportTestCase {
  id: string;
  module: string;
  subModule: string | null;
  title: string;
  priority: string;
  urlPath: string;
  precondition: string | null;
  steps: string;
  expectedResult: string;
}

export interface ReportStepLog {
  stepIndex: number;
  verdict: StepVerdict;
  observation: string;
  confidenceReason: string;
}

export interface ReportRow {
  testId: string;
  module: string;
  subModule: string | null;
  title: string;
  priority: string;
  urlPath: string;
  precondition: string | null;
  steps: string;
  expectedResult: string;
  actualStatus: StepVerdict | "not run";
  actualResultNotes: string;
}

const TRUNCATE_LENGTH = 300;
const VERDICT_SEVERITY: Record<StepVerdict, number> = { pass: 0, blocked: 1, fail: 2 };

function truncate(text: string): string {
  return text.length > TRUNCATE_LENGTH ? `${text.slice(0, TRUNCATE_LENGTH)}…` : text;
}

function worstVerdict(logs: readonly ReportStepLog[]): StepVerdict {
  return logs.reduce<StepVerdict>(
    (worst, log) => (VERDICT_SEVERITY[log.verdict] > VERDICT_SEVERITY[worst] ? log.verdict : worst),
    "pass",
  );
}

/**
 * QA-template report row per Test Case (design §5.11), matching Testify's export
 * columns. Brevity rule: a passing case renders as one line; fail/blocked gets a
 * numbered tool-call trace, with each individual observation/reason still capped at
 * ~300 characters so one noisy blob can't swamp the report.
 */
export function buildReportRows(
  testCases: readonly ReportTestCase[],
  stepLogsByTestCaseId: ReadonlyMap<string, ReportStepLog[]>,
): ReportRow[] {
  return testCases.map((testCase) => {
    const logs = [...(stepLogsByTestCaseId.get(testCase.id) ?? [])].sort((a, b) => a.stepIndex - b.stepIndex);

    if (logs.length === 0) {
      return {
        testId: testCase.id,
        module: testCase.module,
        subModule: testCase.subModule,
        title: testCase.title,
        priority: testCase.priority,
        urlPath: testCase.urlPath,
        precondition: testCase.precondition,
        steps: testCase.steps,
        expectedResult: testCase.expectedResult,
        actualStatus: "not run",
        actualResultNotes: "This case was not reached before the run ended.",
      };
    }

    const status = worstVerdict(logs);
    const notes =
      status === "pass"
        ? truncate(logs.at(-1)?.observation ?? "OK")
        : logs
            .map((log, i) => `${i + 1}. [${log.verdict}] ${truncate(log.observation)} — ${truncate(log.confidenceReason)}`)
            .join("\n");

    return {
      testId: testCase.id,
      module: testCase.module,
      subModule: testCase.subModule,
      title: testCase.title,
      priority: testCase.priority,
      urlPath: testCase.urlPath,
      precondition: testCase.precondition,
      steps: testCase.steps,
      expectedResult: testCase.expectedResult,
      actualStatus: status,
      actualResultNotes: notes,
    };
  });
}
