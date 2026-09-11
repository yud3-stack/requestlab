import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isSensitiveKey, REDACTED, removeRedactedFields } from "@requestlab/shared";
const blockedHeaders = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "host",
  "content-length",
  "connection",
  "transfer-encoding",
  "forwarded",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-real-ip",
  "x-requestlab-demo-secret",
  "x-requestlab-api-key",
  "x-api-key"
]);

export type ReplayRecord = {
  id: string;
  method: string;
  targetUrl: string;
  requestHeaders: unknown;
  requestQuery: unknown;
  requestBody: unknown;
  environment: { type: string };
};
export type ReplayDb = {
  replayRun: {
    findUnique(args: unknown): Promise<ReplayRecord | null>;
    update(args: unknown): Promise<unknown>;
  };
};

export async function executeReplay(
  db: ReplayDb,
  replayId: string,
  options: {
    allowPrivate: boolean;
    allowedHosts?: string[];
    timeoutMs: number;
    maxBytes: number;
    fetch?: typeof fetch;
  }
): Promise<void> {
  const replay = await db.replayRun.findUnique({
    where: { id: replayId },
    include: { environment: true }
  });
  if (!replay) return;
  const startedAt = new Date();
  await db.replayRun.update({ where: { id: replayId }, data: { status: "RUNNING", startedAt } });
  const started = Date.now();
  try {
    const url = new URL(replay.targetUrl);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      replay.environment.type === "PRODUCTION"
    )
      throw new Error("invalid target");
    if (options.allowedHosts?.length && !options.allowedHosts.includes(url.hostname.toLowerCase()))
      throw new Error("target host is not allowed");
    await validateResolvedTarget(url.hostname, options.allowPrivate);
    const query = removeRedactedFields(mask(replay.requestQuery));
    if (query && typeof query === "object" && !Array.isArray(query))
      for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
    const headers = safeHeaders(replay.requestHeaders);
    const requestBody = removeRedactedFields(mask(replay.requestBody));
    let body: string | undefined;
    if (requestBody !== undefined && requestBody !== null) {
      body = JSON.stringify(requestBody);
      if (!Object.keys(headers).some((key) => key.toLowerCase() === "content-type"))
        headers["content-type"] = "application/json";
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs);
    let response: Response;
    try {
      response = await (options.fetch ?? fetch)(url, {
        method: replay.method,
        headers,
        body,
        redirect: "manual",
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
    const bytes = await readLimited(response, options.maxBytes);
    const text = new TextDecoder().decode(bytes);
    const contentType = response.headers.get("content-type") ?? "";
    let responseBody: unknown = contentType.startsWith("text/") ? text : null;
    if (contentType.includes("json")) {
      try {
        responseBody = JSON.parse(text);
      } catch {
        responseBody = text;
      }
    }
    await db.replayRun.update({
      where: { id: replayId },
      data: {
        status: "SUCCEEDED",
        responseHeaders: mask(Object.fromEntries(response.headers)),
        responseBody: mask(responseBody),
        statusCode: response.status,
        durationMs: Date.now() - started,
        finishedAt: new Date()
      }
    });
  } catch (error) {
    const timeout = error instanceof DOMException && error.name === "AbortError";
    await db.replayRun.update({
      where: { id: replayId },
      data: {
        status: timeout ? "UNCERTAIN" : "FAILED",
        errorMessage: timeout
          ? "Replay timed out; completion is uncertain"
          : "Replay request failed",
        durationMs: Date.now() - started,
        finishedAt: new Date()
      }
    });
  }
}

export async function validateResolvedTarget(
  hostname: string,
  allowPrivate: boolean
): Promise<void> {
  if (isIP(hostname) && !allowPrivate && isPrivateHost(hostname)) throw new Error("private target");
  const addresses = await lookup(hostname, { all: true });
  if (
    !addresses.length ||
    (!allowPrivate && addresses.some(({ address }) => isPrivateHost(address)))
  )
    throw new Error("private target");
}

function isPrivateHost(hostname: string): boolean {
  const value = hostname.toLowerCase();
  if (value.startsWith("::ffff:")) return isPrivateHost(value.slice(7));
  if (value === "localhost" || value === "metadata.google.internal") return true;
  const version = isIP(value);
  if (version === 4) {
    const parts = value.split(".").map(Number);
    const a = parts[0] ?? -1;
    const b = parts[1] ?? -1;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a >= 224 && a <= 255)
    );
  }
  return (
    version === 6 &&
    (value === "::1" ||
      value === "::" ||
      value.startsWith("fc") ||
      value.startsWith("fd") ||
      value.startsWith("fe8") ||
      value.startsWith("fe9") ||
      value.startsWith("fea") ||
      value.startsWith("feb") ||
      value.startsWith("ff"))
  );
}

function safeHeaders(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const result: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value))
    if (
      !blockedHeaders.has(key.toLowerCase()) &&
      !isSensitiveKey(key) &&
      typeof raw === "string" &&
      raw !== REDACTED
    )
      result[key] = raw;
  return result;
}
function mask(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(mask);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, isSensitiveKey(key) ? REDACTED : mask(item)])
    );
  return value;
}
async function readLimited(response: Response, maxBytes: number): Promise<Uint8Array> {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("response too large");
    }
    chunks.push(value);
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}
