import { describe, expect, it } from "vitest";
import type { ReportRow } from "./buildReportRows.js";
import { formatCsv } from "./formatCsv.js";

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

describe("formatCsv", () => {
  it("includes a header row followed by one row per data row", () => {
    const csv = formatCsv([row()]);
    const lines = csv.split("\r\n");
    expect(lines[0]).toContain("Test ID");
    expect(lines[1]).toContain("case-1");
    expect(lines).toHaveLength(2);
  });

  it("quotes and escapes a field containing a comma", () => {
    const csv = formatCsv([row({ title: "Apply discount, then checkout" })]);
    expect(csv).toContain('"Apply discount, then checkout"');
  });

  it("quotes and doubles internal quotes in a field containing a quote character", () => {
    const csv = formatCsv([row({ actualResultNotes: 'the banner said "10% off"' })]);
    expect(csv).toContain('"the banner said ""10% off"""');
  });

  it("quotes a field containing a newline (the multi-line fail trace)", () => {
    const csv = formatCsv([row({ actualResultNotes: "1. [pass] a\n2. [fail] b" })]);
    expect(csv).toContain('"1. [pass] a\n2. [fail] b"');
  });

  it("leaves a plain field unquoted", () => {
    const csv = formatCsv([row({ title: "Simple title" })]);
    const dataLine = csv.split("\r\n")[1];
    expect(dataLine).toContain(",Simple title,");
  });
});
