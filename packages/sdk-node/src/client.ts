import { randomUUID } from "node:crypto";
import { resolveOptions, type ResolvedRequestLabOptions } from "./config.js";
import { EventQueue } from "./queue.js";
import { isIgnoredPath, isIncludedPath } from "./paths.js";
import { prepareValue } from "./serialization.js";
import type {
  CapturedRequest,
  RequestLabEvent,
  RequestLabOptions,
  RequestLabStats
} from "./types.js";

export class RequestLabClient {
  readonly options: ResolvedRequestLabOptions;
  private readonly queue: EventQueue;

  constructor(options: RequestLabOptions) {
    this.options = resolveOptions(options);
    this.queue = new EventQueue(
      this.options.maxQueueSize,
      (event) => this.send(event),
      (message) => this.debug(message)
    );
  }

  capture(request: CapturedRequest): boolean {
    if (
      this.options.includePaths.length &&
      !isIncludedPath(request.path, this.options.includePaths)
    )
      return false;
    if (isIgnoredPath(request.path, this.options.ignorePaths)) return false;
    const event: RequestLabEvent = {
      externalEventId: `evt_${randomUUID()}`,
      environment: this.options.environment,
      requestId: request.requestId ?? randomUUID(),
      method: request.method,
      path: request.path,
      route: request.route ?? null,
      query: prepareValue(request.query, this.options.maxBodyBytes),
      requestHeaders: asHeaders(prepareValue(request.requestHeaders, this.options.maxBodyBytes)),
      requestBody: prepareValue(request.requestBody, this.options.maxBodyBytes),
      responseHeaders: asHeaders(prepareValue(request.responseHeaders, this.options.maxBodyBytes)),
      responseBody: prepareValue(request.responseBody, this.options.maxBodyBytes),
      statusCode: request.statusCode,
      durationMs: Math.max(0, Math.round(request.durationMs)),
      errorType: request.errorType ?? null,
      errorMessage: request.errorMessage ?? null,
      stackTrace: this.options.captureStackTrace ? (request.stackTrace ?? null) : null,
      occurredAt: request.occurredAt ?? new Date()
    };
    return this.queue.enqueue(event);
  }

  async flush(): Promise<void> {
    await this.queue.flush();
  }

  async close(): Promise<void> {
    await this.flush();
  }

  getStats(): RequestLabStats {
    return this.queue.getStats();
  }

  private async send(event: RequestLabEvent): Promise<void> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs);
    timer.unref?.();
    try {
      const response = await fetch(`${this.options.apiUrl}/api/v1/events`, {
        method: "POST",
        headers: { "content-type": "application/json", "X-RequestLab-Key": this.options.apiKey },
        body: JSON.stringify(event),
        signal: controller.signal
      });
      if (!response.ok) {
        if (
          response.status !== 401 &&
          response.status !== 403 &&
          response.status !== 409 &&
          response.status < 500
        ) {
          this.debug(`Event delivery rejected with status ${response.status}`);
        }
        throw new Error(`RequestLab event delivery failed with status ${response.status}`);
      }
    } finally {
      clearTimeout(timer);
    }
  }

  private debug(message: string): void {
    if (this.options.debug) console.warn(`[RequestLab] ${message}`);
  }
}

function asHeaders(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
