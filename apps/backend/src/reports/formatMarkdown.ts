import type { ReportRow } from "./buildReportRows.js";

const COLUMNS: Array<{ header: string; get: (row: ReportRow) => string }> = [
  { header: "Test ID", get: (r) => r.testId },
  { header: "Module", get: (r) => r.module },
  { header: "Sub-module", get: (r) => r.subModule ?? "" },
  { header: "Title", get: (r) => r.title },
  { header: "Priority", get: (r) => r.priority },
  { header: "URL Path", get: (r) => r.urlPath },
  { header: "Precondition", get: (r) => r.precondition ?? "" },
  { header: "Expected Result", get: (r) => r.expectedResult },
  { header: "Actual Status", get: (r) => r.actualStatus },
  { header: "Actual Result Notes", get: (r) => r.actualResultNotes },
];

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n/g, "<br>");
}

export function formatMarkdown(rows: readonly ReportRow[]): string {
  const header = `| ${COLUMNS.map((c) => c.header).join(" | ")} |`;
  const divider = `| ${COLUMNS.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${COLUMNS.map((c) => escapeMarkdownCell(c.get(row))).join(" | ")} |`);
  return [header, divider, ...body].join("\n");
}
