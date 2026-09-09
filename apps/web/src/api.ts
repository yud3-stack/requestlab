import type { EventStats, RequestEventDetail, RequestEventSummary } from "@requestlab/shared";

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

export function getRequestHeaders(userId = devUserId): HeadersInit | undefined {
  return userId ? { "x-requestlab-user-id": userId } : undefined;
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

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 8000);
  const abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
      headers: getRequestHeaders(),
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
    if (error instanceof DOMException && error.name === "AbortError")
      throw new ApiError(408, "İstek zaman aşımına uğradı.");
    throw new ApiError(0, "RequestLab API'ye bağlanılamadı.");
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

function queryString(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value !== undefined && value !== "") query.set(key, String(value));
  return query.toString();
}

export const api = {
  projects: () => request<{ data: Project[] }>("/api/projects"),
  project: (id: string) => request<{ data: Project }>(`/api/projects/${id}`),
  environments: (id: string) =>
    request<{ data: Environment[] }>(`/api/projects/${id}/environments`),
  keys: (id: string) => request<{ data: ApiKey[] }>(`/api/projects/${id}/api-keys`),
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
  health: (signal?: AbortSignal) => request<{ status: string; service: string }>("/health", signal)
};
