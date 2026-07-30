import { describe, expect, it } from "vitest";
import type { ReportRow } from "./buildReportRows.js";
import { formatMarkdown } from "./formatMarkdown.js";

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

describe("formatMarkdown", () => {
  it("produces a valid markdown table with a header, divider, and one data row", () => {
    const markdown = formatMarkdown([row()]);
    const lines = markdown.split("\n");
    expect(lines[0]).toContain("Test ID");
    expect(lines[1]).toMatch(/^\|( ---)+/);
    expect(lines[2]).toContain("case-1");
  });

  it("escapes a pipe character in a cell so it doesn't break the table", () => {
    const markdown = formatMarkdown([row({ title: "A | B" })]);
    expect(markdown).toContain("A \\| B");
  });

  it("converts newlines in a multi-line fail trace to <br> so the table stays one row per case", () => {
    const markdown = formatMarkdown([row({ actualResultNotes: "1. [pass] a\n2. [fail] b" })]);
    expect(markdown).toContain("1. [pass] a<br>2. [fail] b");
    const lines = markdown.split("\n");
    expect(lines).toHaveLength(3); // header + divider + exactly one data row
  });
});
