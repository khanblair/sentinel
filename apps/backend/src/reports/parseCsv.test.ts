import { describe, expect, it } from "vitest";
import { parseCsv } from "./parseCsv.js";

describe("parseCsv", () => {
  it("parses simple comma-separated rows", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles a trailing newline without producing a phantom empty row", () => {
    expect(parseCsv("a,b\n1,2\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("handles CRLF line endings", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("keeps commas inside quoted fields intact", () => {
    expect(parseCsv('a,"b, with comma",c\n')).toEqual([["a", "b, with comma", "c"]]);
  });

  it("keeps embedded newlines inside quoted fields intact", () => {
    expect(parseCsv('a,"line1\nline2",c\n')).toEqual([["a", "line1\nline2", "c"]]);
  });

  it("unescapes doubled quotes inside quoted fields", () => {
    expect(parseCsv('a,"she said ""hi""",c\n')).toEqual([["a", 'she said "hi"', "c"]]);
  });

  it("parses a single line with no trailing newline", () => {
    expect(parseCsv("a,b,c")).toEqual([["a", "b", "c"]]);
  });
});
