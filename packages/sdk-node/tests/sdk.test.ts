import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RequestLabClient } from "../src/client.js";
import { requestLabPlugin } from "../src/fastify.js";
import { maskSensitiveData } from "../src/masking.js";
import { EventQueue } from "../src/queue.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("RequestLab SDK", () => {
  it("does not start delivery work when the client is constructed", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const client = new RequestLabClient({
      apiUrl: "http://requestlab.test",
      apiKey: "rlk_test",
      environment: "test"
    });

    expect(client.getStats()).toEqual({ queued: 0, dropped: 0, sent: 0, failed: 0 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("masks nested headers and bodies without mutating input", () => {
    const input = {
      Authorization: "secret",
      nested: { password: "secret" },
      items: [{ accessToken: "token" }]
    };
    const output = maskSensitiveData(input);
    expect(output).toEqual({
      Authorization: "[REDACTED]",
      nested: { password: "[REDACTED]" },
      items: [{ accessToken: "[REDACTED]" }]
    });
    expect(input.nested.password).toBe("secret");
  });

  it("handles circular values and binary metadata", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 202 }))
    );
    const circular: { self?: unknown } = {};
    circular.self = circular;
    const client = new RequestLabClient({
      apiUrl: "http://requestlab.test",
      apiKey: "rlk_test",
      environment: "test"
    });
    expect(
      client.capture({
        method: "POST",
        path: "/test",
        requestBody: circular,
        responseBody: Buffer.from("x"),
        statusCode: 200,
        durationMs: 1
      })
    ).toBe(true);
  });

  it("does not put the API key in debug logs", async () => {
    const apiKey = "rlk_secret_for_test";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 401 }))
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const client = new RequestLabClient({
      apiUrl: "http://requestlab.test",
      apiKey,
      environment: "test",
      debug: true
    });
    client.capture({ method: "GET", path: "/", statusCode: 500, durationMs: 1 });
    await client.flush();
    expect(warn.mock.calls.flat().join(" ")).not.toContain(apiKey);
  });

  it("ignores exact paths without query strings and keeps default capture behavior", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new RequestLabClient({
      apiUrl: "http://requestlab.test",
      apiKey: "rlk_test",
      environment: "test",
      captureMode: "all",
      ignorePaths: ["/health"]
    });

    expect(client.capture({ method: "GET", path: "/health", statusCode: 200, durationMs: 1 })).toBe(
      false
    );
    expect(
      client.capture({
        method: "GET",
        path: "/health?source=render",
        statusCode: 200,
        durationMs: 1
      })
    ).toBe(false);
    expect(
      client.capture({ method: "GET", path: "/health-check", statusCode: 200, durationMs: 1 })
    ).toBe(true);
    await client.flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const defaultClient = new RequestLabClient({
      apiUrl: "http://requestlab.test",
      apiKey: "rlk_test",
      environment: "test",
      captureMode: "all"
    });
    defaultClient.capture({ method: "GET", path: "/health", statusCode: 200, durationMs: 1 });
    await defaultClient.flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("supports excludePaths as an alias", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new RequestLabClient({
      apiUrl: "http://requestlab.test",
      apiKey: "rlk_test",
      environment: "test",
      captureMode: "all",
      excludePaths: ["/health"]
    });

    client.capture({
      method: "GET",
      path: "/health?source=render",
      statusCode: 200,
      durationMs: 1
    });
    await client.flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("captures only exact included paths and ignores query strings", async () => {
    const fetchMock = vi.fn(async () => new Response("", { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new RequestLabClient({
      apiUrl: "http://requestlab.test",
      apiKey: "rlk_test",
      environment: "test",
      captureMode: "all",
      includePaths: ["/api/products"]
    });

    expect(
      client.capture({
        method: "GET",
        path: "/api/products?source=browser",
        statusCode: 200,
        durationMs: 1
      })
    ).toBe(true);
    expect(
      client.capture({ method: "GET", path: "/api/products/other", statusCode: 404, durationMs: 1 })
    ).toBe(false);
    expect(
      client.capture({ method: "GET", path: "/api/orders", statusCode: 200, durationMs: 1 })
    ).toBe(false);
    await client.flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const aliasClient = new RequestLabClient({
      apiUrl: "http://requestlab.test",
      apiKey: "rlk_test",
      environment: "test",
      captureMode: "all",
      capturePaths: ["/api/products"]
    });
    expect(
      aliasClient.capture({ method: "GET", path: "/api/products", statusCode: 200, durationMs: 1 })
    ).toBe(true);
    await aliasClient.flush();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails open when the API is unreachable and preserves request ids", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network unavailable");
    });
    vi.stubGlobal("fetch", fetchMock);
    const app = Fastify();
    await app.register(requestLabPlugin, {
      apiUrl: "http://requestlab.test",
      apiKey: "rlk_test",
      environment: "test",
      captureMode: "all"
    });
    app.get("/ok", async () => ({ ok: true }));
    const response = await app.inject({
      method: "GET",
      url: "/ok",
      headers: { "x-request-id": "request-existing" }
    });
    expect(response.statusCode).toBe(200);
    await app.requestLab?.flush();
    const sent = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(sent.requestId).toBe("request-existing");
    await app.close();
  });

  it("generates a request id and bounds the queue", () => {
    const sender = vi.fn(() => new Promise<void>(() => undefined));
    const queue = new EventQueue(2, sender);
    const event = {
      externalEventId: "evt",
      environment: "test",
      method: "GET",
      path: "/",
      statusCode: 200,
      occurredAt: new Date()
    } as never;
    queue.enqueue(event);
    queue.enqueue(event);
    queue.enqueue(event);
    queue.enqueue(event);
    expect(queue.getStats().dropped).toBe(1);
  });
});
