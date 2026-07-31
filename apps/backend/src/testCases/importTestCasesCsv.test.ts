import { describe, expect, it } from "vitest";
import { parseTestCaseCsv } from "./importTestCasesCsv.js";

describe("parseTestCaseCsv", () => {
  it("parses a well-formed CSV with all required columns", () => {
    const csv = "module,title,priority,urlPath,steps,expectedResult\nCheckout,Apply discount,P1,/cart,1. add item,Discount applied";
    const result = parseTestCaseCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.data).toMatchObject({
      module: "Checkout",
      title: "Apply discount",
      priority: "P1",
      urlPath: "/cart",
      steps: "1. add item",
      expectedResult: "Discount applied",
    });
    expect(result.rows[0]?.line).toBe(2);
  });

  it("is forgiving of header casing/spacing but strict about which columns exist", () => {
    const csv = "Module, Title , PRIORITY,URL Path,Steps,Expected Result\nA,B,C,D,E,F";
    const result = parseTestCaseCsv(csv);
    expect(result.ok).toBe(true);
  });

  it("reports missing required headers by name instead of guessing a mapping", () => {
    const csv = "module,title\nA,B";
    const result = parseTestCaseCsv(csv);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("priority");
    expect(result.error).toContain("urlPath");
  });

  it("rejects an empty file", () => {
    const result = parseTestCaseCsv("");
    expect(result.ok).toBe(false);
  });

  it("parses optional columns, splitting tags on semicolons", () => {
    const csv =
      "module,title,priority,urlPath,steps,expectedResult,subModule,tags,owner\nCheckout,T,P1,/,S,E,Payment,smoke;regression,qa@example.com";
    const result = parseTestCaseCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows[0]?.data.subModule).toBe("Payment");
    expect(result.rows[0]?.data.tags).toEqual(["smoke", "regression"]);
    expect(result.rows[0]?.data.owner).toBe("qa@example.com");
  });

  it("skips blank trailing rows without producing a phantom entry", () => {
    const csv = "module,title,priority,urlPath,steps,expectedResult\nA,B,C,D,E,F\n\n";
    const result = parseTestCaseCsv(csv);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(1);
  });
});
