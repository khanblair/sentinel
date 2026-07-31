import ExcelJS from "exceljs";
import type { ReportRow } from "./buildReportRows.js";

const COLUMNS: Array<{ header: string; key: keyof ReportRow | "subModule" | "precondition"; width: number }> = [
  { header: "Test ID", key: "testId", width: 24 },
  { header: "Module", key: "module", width: 18 },
  { header: "Sub-module", key: "subModule", width: 18 },
  { header: "Title", key: "title", width: 32 },
  { header: "Priority", key: "priority", width: 10 },
  { header: "URL Path", key: "urlPath", width: 20 },
  { header: "Precondition", key: "precondition", width: 24 },
  { header: "Steps", key: "steps", width: 40 },
  { header: "Expected Result", key: "expectedResult", width: 32 },
  { header: "Actual Status", key: "actualStatus", width: 14 },
  { header: "Actual Result Notes", key: "actualResultNotes", width: 48 },
];

const STATUS_FILL: Record<string, string> = {
  pass: "FFDCFCE7",
  fail: "FFFEE2E2",
  blocked: "FFFEF3C7",
};

/** Same QA-template shape as formatCsv/formatMarkdown (design §5.11), rendered as a
 * real worksheet: frozen header row, autosized-ish columns, and a status-colored
 * "Actual Status" cell so a skim of the sheet surfaces failures without reading text. */
export async function formatXlsx(rows: readonly ReportRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Report");

  sheet.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    const added = sheet.addRow({
      testId: row.testId,
      module: row.module,
      subModule: row.subModule ?? "",
      title: row.title,
      priority: row.priority,
      urlPath: row.urlPath,
      precondition: row.precondition ?? "",
      steps: row.steps,
      expectedResult: row.expectedResult,
      actualStatus: row.actualStatus,
      actualResultNotes: row.actualResultNotes,
    });
    added.alignment = { vertical: "top", wrapText: true };
    const fill = STATUS_FILL[row.actualStatus];
    if (fill) {
      added.getCell("actualStatus").fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
    }
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
