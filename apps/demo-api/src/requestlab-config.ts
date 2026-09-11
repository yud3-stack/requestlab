import type { RequestLabOptions } from "@requestlab/sdk-node";

export const DEFAULT_REQUESTLAB_TIMEOUT_MS = 1000;
export const MAX_REQUESTLAB_TIMEOUT_MS = 30_000;

export function parseRequestLabTimeoutMs(value: string | undefined): number {
  if (!value?.trim()) return DEFAULT_REQUESTLAB_TIMEOUT_MS;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_REQUESTLAB_TIMEOUT_MS)
    return DEFAULT_REQUESTLAB_TIMEOUT_MS;
  return parsed;
}

export function getRequestLabOptions(
  env: NodeJS.ProcessEnv = process.env
): RequestLabOptions | undefined {
  const apiUrl = env.REQUESTLAB_API_URL;
  const apiKey = env.REQUESTLAB_API_KEY;
  if (!apiUrl || !apiKey) return undefined;
  return {
    apiUrl,
    apiKey,
    environment: env.REQUESTLAB_ENVIRONMENT ?? "development",
    captureMode: env.REQUESTLAB_CAPTURE_MODE === "all" ? "all" : "errors",
    timeoutMs: parseRequestLabTimeoutMs(env.REQUESTLAB_TIMEOUT_MS),
    ignorePaths: [
      "/health",
      "/internal/demo/scenarios/order-error",
      "/internal/demo/scenarios/login-error",
      "/internal/demo/scenarios/slow-request"
    ],
    includePaths: [
      "/api/products",
      "/api/orders",
      "/api/orders/order-1",
      "/api/auth/login",
      "/api/demo/slow"
    ]
  };
}
