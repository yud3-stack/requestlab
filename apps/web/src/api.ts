import type {
  CreateReplayInput,
  EventStats,
  ReplayDetail,
  ReplayPage,
  ReplaySummary,
  RequestEventDetail,
  RequestEventSummary
} from "@requestlab/shared";

export type Project = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
};
export type Environment = {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  type: string;
  baseUrl: string | null;
  replayEnabled: boolean;
  createdAt: string;
  updatedAt: string;
};
export type ApiKey = {
  id: string;
  projectId: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};
export type EventQuery = {
  page?: number;
  pageSize?: number;
  search?: string;
  method?: string;
  statusCode?: string;
  environmentId?: string;
  from?: string;
  to?: string;
};
export type EventPage = {
  data: RequestEventSummary[];
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
};

const baseUrl = import.meta.env.VITE_REQUESTLAB_API_URL || "http://localhost:3001";
const devUserId = import.meta.env.VITE_REQUESTLAB_DEV_USER_ID;
const demoMode = import.meta.env.VITE_DEMO_MODE === "true";
const DEFAULT_TIMEOUT_MS = 8_000;
const PUBLIC_DEMO_TIMEOUT_MS = 45_000;
const RETRY_BACKOFF_MS = 250;
const DEMO_TOKEN_REFRESH_SKEW_MS = 60_000;
const MAX_RETRIES = 1;
const RETRYABLE_STATUS_CODES = new Set([502, 503]);
let demoToken: string | undefined;
let demoTokenExpiresAt = 0;
let demoSessionPromise: Promise<string> | undefined;

export function getRequestHeaders(userId = devUserId): HeadersInit | undefined {
  return !demoMode && userId ? { "x-requestlab-user-id": userId } : undefined;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function resetDemoSession(): void {
  demoToken = undefined;
  demoTokenExpiresAt = 0;
}

function hasValidDemoToken(): boolean {
  return Boolean(demoToken && Date.now() < demoTokenExpiresAt - DEMO_TOKEN_REFRESH_SKEW_MS);
}

export async function ensureDemoSession(): Promise<string> {
  if (hasValidDemoToken()) return demoToken!;
  if (!demoSessionPromise) {
    demoSessionPromise = request<{
      data?: { token?: string; expiresInSeconds?: number };
    }>("/api/demo/session", undefined, { method: "POST" })
      .then((body) => {
        const token = body.data?.token;
        if (!token) throw new ApiError(503, "Public demo session is unavailable.");
        demoToken = token;
        const expiresInSeconds = body.data?.expiresInSeconds;
        demoTokenExpiresAt =
          typeof expiresInSeconds === "number" && expiresInSeconds > 0
            ? Date.now() + expiresInSeconds * 1_000
            : tokenExpiry(token);
        return token;
      })
      .finally(() => {
        demoSessionPromise = undefined;
      });
  }
  return demoSessionPromise;
}

function tokenExpiry(token: string): number {
  try {
    const encoded = token.split(".")[0];
    if (!encoded) return 0;
    const claims = JSON.parse(atob(encoded.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof claims.exp === "number" ? claims.exp * 1_000 : 0;
  } catch {
    return 0;
  }
}

async function request<T>(
  path: string,
  signal?: AbortSignal,
  init: RequestInit = {},
  retryDemo = true
): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const isSessionRequest = path === "/api/demo/session";
  const maxRetries = isSessionRequest || method === "GET" ? MAX_RETRIES : 0;
  let attempt = 0;
  while (true) {
    const demoBearer = demoMode && !isSessionRequest ? await ensureDemoSession() : undefined;
    try {
      return await requestOnce<T>(path, signal, init, demoBearer);
    } catch (error) {
      if (demoMode && retryDemo && error instanceof ApiError && error.status === 401) {
        resetDemoSession();
        return request<T>(path, signal, init, false);
      }
      if (attempt < maxRetries && shouldRetry(error, method) && !signal?.aborted) {
        attempt += 1;
        await delay(RETRY_BACKOFF_MS);
        continue;
      }
      throw error;
    }
  }
}

async function requestOnce<T>(
  path: string,
  signal: AbortSignal | undefined,
  init: RequestInit,
  demoBearer: string | undefined
): Promise<T> {
  const controller = new AbortController();
  const isSessionRequest = path === "/api/demo/session";
  const timeoutMs =
    isSessionRequest || (demoMode && path === "/api/projects")
      ? PUBLIC_DEMO_TIMEOUT_MS
      : DEFAULT_TIMEOUT_MS;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
      ...init,
      headers: {
        ...(init.headers ?? {}),
        ...(getRequestHeaders() ?? {}),
        ...(demoBearer ? { Authorization: `Bearer ${demoBearer}` } : {})
      },
      signal: controller.signal
    });
    const text = await response.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      throw new ApiError(response.status, "Sunucudan geçersiz JSON yanıtı alındı.");
    }
    if (!response.ok) {
      const message =
        typeof body === "object" &&
        body !== null &&
        "error" in body &&
        typeof body.error === "object" &&
        body.error !== null &&
        "message" in body.error &&
        typeof body.error.message === "string"
          ? body.error.message
          : `İstek başarısız oldu (${response.status}).`;
      throw new ApiError(response.status, message);
    }
    return body as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      if (signal?.aborted && !timedOut) throw new ApiError(0, "İstek iptal edildi.");
      throw new ApiError(408, "İstek zaman aşımına uğradı.");
    }
    throw new ApiError(0, "RequestLab API'ye bağlanılamadı.");
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

function shouldRetry(error: unknown, method: string): boolean {
  if (method !== "GET" && method !== "POST") return false;
  if (!(error instanceof ApiError)) return false;
  return error.status === 0 || error.status === 408 || RETRYABLE_STATUS_CODES.has(error.status);
}

async function delay(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function queryString(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value !== undefined && value !== "") query.set(key, String(value));
  return query.toString();
}

export const api = {
  projects: (signal?: AbortSignal) => request<{ data: Project[] }>("/api/projects", signal),
  project: (id: string, signal?: AbortSignal) =>
    request<{ data: Project }>(`/api/projects/${id}`, signal),
  environments: (id: string, signal?: AbortSignal) =>
    request<{ data: Environment[] }>(`/api/projects/${id}/environments`, signal),
  keys: (id: string, signal?: AbortSignal) =>
    request<{ data: ApiKey[] }>(`/api/projects/${id}/api-keys`, signal),
  events: (id: string, params: EventQuery, signal?: AbortSignal) =>
    request<EventPage>(`/api/projects/${id}/events?${queryString(params)}`, signal),
  stats: (
    id: string,
    params: Pick<EventQuery, "environmentId" | "from" | "to">,
    signal?: AbortSignal
  ) =>
    request<{ data: EventStats }>(
      `/api/projects/${id}/events/stats?${queryString(params)}`,
      signal
    ),
  event: (projectId: string, eventId: string, signal?: AbortSignal) =>
    request<{ data: RequestEventDetail }>(`/api/projects/${projectId}/events/${eventId}`, signal),
  createReplay: (projectId: string, eventId: string, input: CreateReplayInput) =>
    request<{ data: ReplaySummary }>(
      `/api/projects/${projectId}/events/${eventId}/replays`,
      undefined,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input)
      }
    ),
  replays: (
    projectId: string,
    params: Record<string, string | number | undefined>,
    signal?: AbortSignal
  ) => request<ReplayPage>(`/api/projects/${projectId}/replays?${queryString(params)}`, signal),
  replay: (projectId: string, replayId: string, signal?: AbortSignal) =>
    request<{ data: ReplayDetail }>(`/api/projects/${projectId}/replays/${replayId}`, signal),
  demoScenario: (scenario: "order-error" | "login-error" | "slow-request") =>
    request<{ data: { scenario: string; statusCode: number } }>(
      `/api/demo/scenarios/${scenario}`,
      undefined,
      { method: "POST" }
    ),
  health: (signal?: AbortSignal) => request<{ status: string; service: string }>("/health", signal)
};
