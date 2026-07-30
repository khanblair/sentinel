import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

/**
 * The key file lives outside the repo tree's tracked content (gitignored) so a
 * public clone never ships anyone's encryption key alongside the DB it protects.
 */
function defaultKeyPath(): string {
  return join(process.cwd(), ".keys", "encryption.key");
}

export function loadOrCreateEncryptionKey(keyPath: string = defaultKeyPath()): Buffer {
  if (existsSync(keyPath)) {
    const key = readFileSync(keyPath);
    if (key.length !== KEY_LENGTH) {
      throw new Error(`Encryption key at ${keyPath} has invalid length ${key.length}, expected ${KEY_LENGTH}`);
    }
    return key;
  }

  const key = randomBytes(KEY_LENGTH);
  mkdirSync(dirname(keyPath), { recursive: true });
  writeFileSync(keyPath, key, { mode: 0o600 });
  return key;
}

export function encrypt(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decrypt(payload: string, key: Buffer): string {
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ciphertext = raw.subarray(IV_LENGTH + 16);

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
