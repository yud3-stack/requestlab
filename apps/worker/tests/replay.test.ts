import { describe, expect, it, vi } from "vitest";
import { executeReplay, validateResolvedTarget } from "../src/replay.js";

function database() {
  const updates: Array<{ data: Record<string, unknown> }> = [];
  return {
    updates,
    replayRun: {
      findUnique: vi.fn(async () => ({
        id: "replay-1",
        method: "GET",
        targetUrl: "https://example.com/orders",
        requestHeaders: {
          authorization: "[REDACTED]",
          cookie: "session",
          host: "evil",
          "x-safe": "yes"
        },
        requestQuery: { page: 1 },
        requestBody: null,
        environment: { type: "TEST" }
      })),
      update: vi.fn(async (args: { data: Record<string, unknown> }) => {
        updates.push(args);
      })
    }
  };
}

describe("replay target validation", () => {
  it("rejects private IPv4, IPv6 loopback and metadata targets", async () => {
    await expect(validateResolvedTarget("127.0.0.1", false)).rejects.toThrow();
    await expect(validateResolvedTarget("::1", false)).rejects.toThrow();
    await expect(validateResolvedTarget("169.254.169.254", false)).rejects.toThrow();
  });
});

describe("replay worker execution", () => {
  it("transitions through running to succeeded, filters headers and does not follow redirects", async () => {
    const db = database();
    const fetch = vi.fn(async (_url: URL, init?: RequestInit) => {
      expect(init?.redirect).toBe("manual");
      expect(init?.headers).toEqual({ "x-safe": "yes" });
      return new Response(JSON.stringify({ password: "hidden", ok: true }), {
        status: 302,
        headers: { "content-type": "application/json", location: "https://other.example" }
      });
    });
    await executeReplay(db, "replay-1", {
      allowPrivate: false,
      timeoutMs: 1000,
      maxBytes: 1024,
      fetch
    });
    expect(fetch).toHaveBeenCalledOnce();
    expect(db.updates.map((update) => update.data.status)).toEqual(["RUNNING", "SUCCEEDED"]);
    expect(db.updates[1]?.data.responseBody).toEqual({ password: "[REDACTED]", ok: true });
  });

  it("removes redacted and legacy sensitive request fields before sending an order replay", async () => {
    const db = database();
    db.replayRun.findUnique.mockResolvedValue({
      id: "replay-1",
      method: "POST",
      targetUrl: "https://example.com/orders",
      requestHeaders: { "x-safe": "yes", "x-api-key": "legacy-key" },
      requestQuery: { page: "[REDACTED]", nested: { token: "legacy-token", keep: "yes" } },
      requestBody: {
        orderId: "order-1",
        credentials: { password: "legacy-password", keep: true },
        items: [{ secret: "[REDACTED]", sku: "sku-1" }]
      },
      environment: { type: "TEST" }
    });
    const fetch = vi.fn(async (url: URL, init?: RequestInit) => {
      expect(url.search).toBe("?nested=%5Bobject+Object%5D");
      expect(init?.method).toBe("POST");
      expect(init?.headers).toEqual({ "x-safe": "yes", "content-type": "application/json" });
      expect(JSON.parse(String(init?.body))).toEqual({
        orderId: "order-1",
        credentials: { keep: true },
        items: [{ sku: "sku-1" }]
      });
      return new Response(JSON.stringify({ created: true }), {
        status: 201,
        headers: { "content-type": "application/json" }
      });
    });

    await executeReplay(db, "replay-1", {
      allowPrivate: false,
      timeoutMs: 1000,
      maxBytes: 1024,
      fetch
    });

    expect(db.updates[1]?.data.status).toBe("SUCCEEDED");
    expect(db.updates[1]?.data.statusCode).toBe(201);
  });

  it("marks timeout as uncertain and limits response size", async () => {
    const timeoutDb = database();
    const timeoutFetch = vi.fn(
      (_url: URL, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError"))
          );
        })
    );
    await executeReplay(timeoutDb, "replay-1", {
      allowPrivate: false,
      timeoutMs: 5,
      maxBytes: 1024,
      fetch: timeoutFetch
    });
    expect(timeoutDb.updates[1]?.data.status).toBe("UNCERTAIN");

    const largeDb = database();
    const largeFetch = vi.fn(
      async () => new Response("0123456789", { headers: { "content-type": "text/plain" } })
    );
    await executeReplay(largeDb, "replay-1", {
      allowPrivate: false,
      timeoutMs: 1000,
      maxBytes: 2,
      fetch: largeFetch
    });
    expect(largeDb.updates[1]?.data.status).toBe("FAILED");
  });
});
