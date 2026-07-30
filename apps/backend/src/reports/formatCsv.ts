import type { ReportRow } from "./buildReportRows.js";

const COLUMNS: Array<{ header: string; get: (row: ReportRow) => string }> = [
  { header: "Test ID", get: (r) => r.testId },
  { header: "Module", get: (r) => r.module },
  { header: "Sub-module", get: (r) => r.subModule ?? "" },
  { header: "Title", get: (r) => r.title },
  { header: "Priority", get: (r) => r.priority },
  { header: "URL Path", get: (r) => r.urlPath },
  { header: "Precondition", get: (r) => r.precondition ?? "" },
  { header: "Steps", get: (r) => r.steps },
  { header: "Expected Result", get: (r) => r.expectedResult },
  { header: "Actual Status", get: (r) => r.actualStatus },
  { header: "Actual Result Notes", get: (r) => r.actualResultNotes },
];

/** RFC 4180: a field is quoted (and its internal quotes doubled) if it contains a
 * comma, quote, or newline — otherwise left bare. */
function escapeCsvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function formatCsv(rows: readonly ReportRow[]): string {
  const header = COLUMNS.map((c) => escapeCsvField(c.header)).join(",");
  const body = rows.map((row) => COLUMNS.map((c) => escapeCsvField(c.get(row))).join(","));
  return [header, ...body].join("\r\n");
}
