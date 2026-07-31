import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import type { ReportRow } from "./buildReportRows.js";
import { formatXlsx } from "./formatXlsx.js";

function row(overrides: Partial<ReportRow> = {}): ReportRow {
  return {
    testId: "case-1",
    module: "Checkout",
    subModule: "Payment",
    title: "Apply discount",
    priority: "P1",
    urlPath: "/cart",
    precondition: null,
    steps: "1. add item",
    expectedResult: "total reduced by 10%",
    actualStatus: "pass",
    actualResultNotes: "OK",
    ...overrides,
  };
}

async function loadSheet(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook.getWorksheet("Report")!;
}

describe("formatXlsx", () => {
  it("writes a header row followed by one row per data row", async () => {
    const buffer = await formatXlsx([row()]);
    const sheet = await loadSheet(buffer);
    expect(sheet.getRow(1).getCell(1).value).toBe("Test ID");
    expect(sheet.getRow(2).getCell(1).value).toBe("case-1");
    expect(sheet.rowCount).toBe(2);
  });

  // exceljs's `column.key` is a write-time convenience and doesn't round-trip through
  // the xlsx format on load, so reads below use the fixed column order from COLUMNS.
  const COL = { subModule: 3, precondition: 7, actualStatus: 10, actualResultNotes: 11 };

  it("preserves multi-line notes and null subModule/precondition as empty strings", async () => {
    const buffer = await formatXlsx([
      row({ subModule: null, precondition: null, actualResultNotes: "1. [pass] a\n2. [fail] b" }),
    ]);
    const sheet = await loadSheet(buffer);
    const dataRow = sheet.getRow(2);
    expect(dataRow.getCell(COL.subModule).value).toBe("");
    expect(dataRow.getCell(COL.precondition).value).toBe("");
    expect(dataRow.getCell(COL.actualResultNotes).value).toBe("1. [pass] a\n2. [fail] b");
  });

  it("fills the Actual Status cell with a status color for fail/blocked rows", async () => {
    const buffer = await formatXlsx([row({ actualStatus: "fail" })]);
    const sheet = await loadSheet(buffer);
    const cell = sheet.getRow(2).getCell(COL.actualStatus);
    expect(cell.fill).toMatchObject({ type: "pattern", pattern: "solid" });
  });

  it("fills the Actual Status cell green for a passing row", async () => {
    const buffer = await formatXlsx([row({ actualStatus: "pass" })]);
    const sheet = await loadSheet(buffer);
    const cell = sheet.getRow(2).getCell(COL.actualStatus);
    expect(cell.fill).toMatchObject({ type: "pattern", pattern: "solid" });
  });

  it("leaves the Actual Status cell unfilled for a 'not run' row", async () => {
    const buffer = await formatXlsx([row({ actualStatus: "not run" })]);
    const sheet = await loadSheet(buffer);
    const cell = sheet.getRow(2).getCell(COL.actualStatus);
    expect(cell.fill).not.toMatchObject({ type: "pattern", pattern: "solid" });
  });
});
