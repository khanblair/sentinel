import { describe, expect, it } from "vitest";
import { isClientMessage } from "@sentinel/shared";

describe("isClientMessage", () => {
  it("accepts a well-formed ping message", () => {
    expect(isClientMessage({ type: "ping", sentAt: new Date().toISOString() })).toBe(true);
  });

  it("rejects null", () => {
    expect(isClientMessage(null)).toBe(false);
  });

  it("rejects a message with no type field", () => {
    expect(isClientMessage({ sentAt: "now" })).toBe(false);
  });

  it("rejects a non-string type field", () => {
    expect(isClientMessage({ type: 42 })).toBe(false);
  });
});
