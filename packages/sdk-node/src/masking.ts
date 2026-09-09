const sensitiveKeys = new Set([
  "authorization",
  "proxyauthorization",
  "cookie",
  "setcookie",
  "password",
  "passphrase",
  "token",
  "accesstoken",
  "refreshtoken",
  "secret",
  "apikey",
  "creditcard",
  "cardnumber",
  "cvv"
]);

const redacted = "[REDACTED]";

function normalizedKey(key: string): string {
  return key.toLowerCase().replace(/[-_]/g, "");
}

export function maskSensitiveData<T>(input: T): T {
  return maskValue(input, new WeakSet<object>()) as T;
}

function maskValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== "object") return value;
  if (
    value instanceof Date ||
    value instanceof Error ||
    (typeof Buffer !== "undefined" && Buffer.isBuffer(value))
  )
    return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => maskValue(item, seen));
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    output[key] = sensitiveKeys.has(normalizedKey(key)) ? redacted : maskValue(child, seen);
  }
  return output;
}

export const REDACTED = redacted;
