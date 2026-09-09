import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { RequestLabClient } from "./client.js";
import { prepareValue } from "./serialization.js";
import type { RequestLabOptions } from "./types.js";

declare module "fastify" {
  interface FastifyInstance {
    requestLab?: RequestLabClient;
  }
}

type RequestState = {
  startedAt: number;
  requestBody?: unknown;
  responseBody?: unknown;
  error?: Error;
};

async function registerRequestLabPlugin(
  app: FastifyInstance,
  options: RequestLabOptions
): Promise<void> {
  const client = new RequestLabClient(options);
  app.decorate("requestLab", client);
  installRequestLabHooks(app, client);
}

export function installRequestLabHooks(app: FastifyInstance, client: RequestLabClient): void {
  const states = new WeakMap<FastifyRequest, RequestState>();
  app.addHook("onRequest", async (request) => {
    states.set(request, { startedAt: Date.now() });
  });
  app.addHook("preHandler", async (request) => {
    const state = states.get(request);
    if (state) state.requestBody = request.body;
  });
  app.addHook("onError", async (request, _reply, error) => {
    const state = states.get(request);
    if (state) state.error = error;
  });
  app.addHook("onSend", async (request, reply, payload) => {
    const state = states.get(request);
    if (state)
      state.responseBody = readResponsePayload(reply, payload, client.options.maxBodyBytes);
    return payload;
  });
  app.addHook("onResponse", async (request, reply) => {
    const state = states.get(request);
    if (!state) return;
    const statusCode = reply.statusCode;
    if (client.options.captureMode === "errors" && statusCode < 400 && !state.error) return;
    const headers = request.headers;
    const requestId = getRequestId(headers["x-request-id"]);
    client.capture({
      requestId,
      method: request.method,
      path: request.url.split("?")[0] ?? request.url,
      route: request.routeOptions.url,
      query: request.query,
      requestHeaders: headers,
      requestBody: state.requestBody,
      responseHeaders: reply.getHeaders(),
      responseBody: state.responseBody,
      statusCode,
      durationMs: Date.now() - state.startedAt,
      errorType: state.error?.name ?? (statusCode >= 400 ? `HTTP_${statusCode}` : null),
      errorMessage: state.error?.message ?? null,
      stackTrace: state.error?.stack ?? null
    });
  });
}

export const requestLabPlugin = fp(registerRequestLabPlugin, {
  name: "requestlab"
});

function getRequestId(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function readResponsePayload(reply: FastifyReply, payload: unknown, maxBodyBytes: number): unknown {
  const contentType = String(reply.getHeader("content-type") ?? "");
  if (Buffer.isBuffer(payload))
    return { _requestLab: { kind: "binary", byteLength: payload.byteLength } };
  if (typeof payload === "string") {
    if (contentType.includes("json")) {
      try {
        return prepareValue(JSON.parse(payload), maxBodyBytes);
      } catch {
        return { _requestLab: { kind: "unparseable", byteLength: Buffer.byteLength(payload) } };
      }
    }
    return prepareValue(payload, maxBodyBytes);
  }
  return prepareValue(payload, maxBodyBytes);
}
