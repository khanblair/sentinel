import { describe, expect, it } from "vitest";
import { describeConnectionFailure } from "./providerConfigs.js";

describe("describeConnectionFailure", () => {
  it("recognizes an invalid/unauthorized key", () => {
    expect(describeConnectionFailure(new Error("401 Unauthorized"))).toContain("rejected");
    expect(describeConnectionFailure(new Error("Invalid API Key provided"))).toContain("rejected");
  });

  it("recognizes rate limiting as distinct from an invalid key", () => {
    expect(describeConnectionFailure(new Error("429 Too Many Requests"))).toContain("rate-limited");
  });

  it("recognizes network failures", () => {
    expect(describeConnectionFailure(new Error("fetch failed"))).toContain("reach the provider");
  });

  it("falls back to a generic message for anything else, without echoing the raw error", () => {
    const message = describeConnectionFailure(new Error("sk-super-secret-key-12345 was in this exception"));
    expect(message).not.toContain("sk-super-secret-key-12345");
  });

  it("handles non-Error throws without crashing", () => {
    expect(() => describeConnectionFailure("a plain string throw")).not.toThrow();
  });
});
