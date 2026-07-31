import { parseCsv } from "../reports/parseCsv.js";

export interface ImportedTestCaseRow {
  module: string;
  title: string;
  priority: string;
  urlPath: string;
  steps: string;
  expectedResult: string;
  subModule?: string;
  precondition?: string;
  tags?: string[];
  owner?: string;
  linkedIssueUrl?: string;
}

export type ParseTestCaseCsvResult =
  | { ok: true; rows: Array<{ line: number; data: ImportedTestCaseRow }> }
  | { ok: false; error: string };

const REQUIRED_HEADERS = ["module", "title", "priority", "urlpath", "steps", "expectedresult"] as const;

const HEADER_TO_FIELD: Record<string, keyof ImportedTestCaseRow> = {
  module: "module",
  title: "title",
  priority: "priority",
  urlpath: "urlPath",
  steps: "steps",
  expectedresult: "expectedResult",
  submodule: "subModule",
  precondition: "precondition",
  tags: "tags",
  owner: "owner",
  linkedissueurl: "linkedIssueUrl",
};

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Strict-header CSV import (design tradeoff: a mapping UI is 5D-scale work — this
 * requires the exact expected columns and reports which are missing, rather than
 * guessing at a mapping). Blank rows (common at file end) are skipped silently;
 * everything else either maps cleanly or is reported as a per-row error by the
 * caller, which is responsible for actually creating each test case. */
export function parseTestCaseCsv(csvText: string): ParseTestCaseCsvResult {
  const table = parseCsv(csvText).filter((row) => row.some((cell) => cell.trim() !== ""));
  if (table.length === 0) {
    return { ok: false, error: "The CSV file is empty." };
  }

  const headerRow = table[0]!;
  const normalizedHeaders = headerRow.map(normalizeHeader);
  const missing = REQUIRED_HEADERS.filter((h) => !normalizedHeaders.includes(h));
  if (missing.length > 0) {
    return {
      ok: false,
      error: `Missing required columns: ${missing.join(", ")}. Expected headers: module, title, priority, urlPath, steps, expectedResult (subModule, precondition, tags, owner, linkedIssueUrl are optional).`,
    };
  }

  const columnIndexByField = new Map<keyof ImportedTestCaseRow, number>();
  normalizedHeaders.forEach((normalized, index) => {
    const field = HEADER_TO_FIELD[normalized];
    if (field) columnIndexByField.set(field, index);
  });

  const rows: Array<{ line: number; data: ImportedTestCaseRow }> = [];
  for (let i = 1; i < table.length; i += 1) {
    const cells = table[i]!;
    const get = (field: keyof ImportedTestCaseRow): string => {
      const index = columnIndexByField.get(field);
      return index === undefined ? "" : (cells[index] ?? "").trim();
    };

    const tagsRaw = get("tags");
    rows.push({
      line: i + 1,
      data: {
        module: get("module"),
        title: get("title"),
        priority: get("priority"),
        urlPath: get("urlPath"),
        steps: get("steps"),
        expectedResult: get("expectedResult"),
        subModule: get("subModule") || undefined,
        precondition: get("precondition") || undefined,
        tags: tagsRaw ? tagsRaw.split(";").map((t) => t.trim()).filter(Boolean) : undefined,
        owner: get("owner") || undefined,
        linkedIssueUrl: get("linkedIssueUrl") || undefined,
      },
    });
  }

  return { ok: true, rows };
}
