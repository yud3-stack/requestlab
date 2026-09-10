const sensitiveKeys = new Set([
  "authorization",
  "cookie",
  "setcookie",
  "password",
  "token",
  "accesstoken",
  "refreshtoken",
  "secret",
  "xrequestlabdemosecret",
  "xrequestlabapikey",
  "requestlabdemosecret",
  "requestlabapikey",
  "databaseurl",
  "directurl",
  "redisurl",
  "apikey",
  "creditcard",
  "cvv"
]);

const redacted = "[REDACTED]";

function keyName(value: string): string {
  return value.toLowerCase().replace(/[-_]/g, "");
}

export function maskSensitiveData<T>(input: T): T {
  if (Array.isArray(input)) {
    return input.map((item) => maskSensitiveData(item)) as T;
  }
  if (input !== null && typeof input === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      output[key] = sensitiveKeys.has(keyName(key)) ? redacted : maskSensitiveData(value);
    }
    return output as T;
  }
  return input;
}

export const MAX_HEADERS_BYTES = 32 * 1024;
export const MAX_JSON_BYTES = 128 * 1024;

export function assertPayloadSize(value: unknown, maxBytes: number, label: string): void {
  const bytes = Buffer.byteLength(JSON.stringify(value ?? null), "utf8");
  if (bytes > maxBytes) {
    throw new Error(`${label} exceeds the maximum allowed size`);
  }
}
