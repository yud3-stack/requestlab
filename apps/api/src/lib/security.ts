import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function createApiKey(): { plainText: string; keyPrefix: string; keyHash: string } {
  const plainText = `rlk_${randomBytes(32).toString("base64url")}`;
  return { plainText, keyPrefix: plainText.slice(0, 12), keyHash: hashApiKey(plainText) };
}

export function hashApiKey(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function compareApiKey(value: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashApiKey(value), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
