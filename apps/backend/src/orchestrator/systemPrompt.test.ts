import { describe, expect, it } from "vitest";
import { composePersonaAndRules, withPersonaPrefix } from "./systemPrompt.js";

describe("composePersonaAndRules", () => {
  it("returns just the persona when there are no rules", () => {
    expect(composePersonaAndRules("You are careful.", [])).toBe("You are careful.");
  });

  it("appends a bulleted rules block after the persona", () => {
    const result = composePersonaAndRules("You are careful.", ["Never submit real payment forms", "Be gentle"]);
    expect(result).toBe(
      "You are careful.\n\nRules you must follow:\n- Never submit real payment forms\n- Be gentle",
    );
  });
});

describe("withPersonaPrefix", () => {
  it("prepends the prefix ahead of the task prompt, separated by a blank line", () => {
    expect(withPersonaPrefix("Persona + rules", "Task instructions")).toBe("Persona + rules\n\nTask instructions");
  });

  it("returns the task prompt unchanged when there is no prefix", () => {
    expect(withPersonaPrefix(undefined, "Task instructions")).toBe("Task instructions");
  });
});
