import type { IngestEventInput } from "@requestlab/shared";

export type RequestLabOptions = {
  apiUrl: string;
  apiKey: string;
  environment: string;
  serviceName?: string;
  captureMode?: "errors" | "all";
  timeoutMs?: number;
  maxBodyBytes?: number;
  maxQueueSize?: number;
  captureStackTrace?: boolean;
  debug?: boolean;
};

export type RequestLabEvent = IngestEventInput;

export type CapturedRequest = {
  requestId?: string;
  method: string;
  path: string;
  route?: string | null;
  query?: unknown;
  requestHeaders?: unknown;
  requestBody?: unknown;
  responseHeaders?: unknown;
  responseBody?: unknown;
  statusCode: number;
  durationMs: number;
  errorType?: string | null;
  errorMessage?: string | null;
  stackTrace?: string | null;
  occurredAt?: Date;
};

export type RequestLabStats = {
  queued: number;
  dropped: number;
  sent: number;
  failed: number;
};
