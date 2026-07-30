import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "./encryption.js";

describe("encrypt/decrypt", () => {
  const key = randomBytes(32);

  it("round-trips plaintext", () => {
    const ciphertext = encrypt("sk-test-api-key-value", key);
    expect(decrypt(ciphertext, key)).toBe("sk-test-api-key-value");
  });

  it("produces different ciphertext for the same plaintext (random IV)", () => {
    const a = encrypt("same-value", key);
    const b = encrypt("same-value", key);
    expect(a).not.toBe(b);
  });

  it("throws when decrypting with the wrong key", () => {
    const ciphertext = encrypt("secret", key);
    const wrongKey = randomBytes(32);
    expect(() => decrypt(ciphertext, wrongKey)).toThrow();
  });

  it("throws when ciphertext has been tampered with", () => {
    const ciphertext = encrypt("secret", key);
    const raw = Buffer.from(ciphertext, "base64");
    raw[raw.length - 1] = (raw[raw.length - 1] ?? 0) ^ 0xff;
    const tampered = raw.toString("base64");
    expect(() => decrypt(tampered, key)).toThrow();
  });
});
