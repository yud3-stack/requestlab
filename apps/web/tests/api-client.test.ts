// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, ensureDemoSession, getRequestHeaders, resetDemoSession } from "../src/api";

const projectResponse = {
  data: [
    {
      id: "project-1",
      name: "Shop API",
      slug: "shop-api",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-01-01T00:00:00Z"
    }
  ]
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
  resetDemoSession();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetDemoSession();
});

describe("frontend development identity", () => {
  it("sends the development user header when configured", () => {
    expect(getRequestHeaders("seed-user-id")).toEqual({
      "x-requestlab-user-id": "seed-user-id"
    });
  });

  it("does not send an identity header when it is not configured", () => {
    expect(getRequestHeaders(undefined)).toBeUndefined();
  });
});

describe("public demo session", () => {
  it("shares one in-flight session request across ten callers", async () => {
    let resolveRequest: ((response: Response) => void) | undefined;
    const fetchMock = vi.fn(() => new Promise<Response>((resolve) => (resolveRequest = resolve)));
    vi.stubGlobal("fetch", fetchMock);

    const requests = Array.from({ length: 10 }, () => ensureDemoSession());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveRequest?.(jsonResponse(200, { data: { token: "rlk_session", expiresInSeconds: 1800 } }));
    const tokens = await Promise.all(requests);

    expect(tokens).toEqual(Array(10).fill("rlk_session"));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain("rlk_session");
    expect(localStorage.getItem("requestlab-demo-token")).toBeNull();
  });

  it("clears a failed in-flight request so a manual retry can start", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(400, { error: { message: "invalid" } }))
      .mockResolvedValueOnce(
        jsonResponse(200, { data: { token: "rlk_retry", expiresInSeconds: 1800 } })
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(ensureDemoSession()).rejects.toBeInstanceOf(ApiError);
    await expect(ensureDemoSession()).resolves.toBe("rlk_retry");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("refreshes an expired token only once for concurrent callers", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(200, { data: { token: "rlk_old", expiresInSeconds: 120 } })
      )
      .mockResolvedValueOnce(
        jsonResponse(200, { data: { token: "rlk_new", expiresInSeconds: 1800 } })
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(ensureDemoSession()).resolves.toBe("rlk_old");
    vi.advanceTimersByTime(61_000);
    const tokens = await Promise.all(Array.from({ length: 10 }, () => ensureDemoSession()));

    expect(tokens).toEqual(Array(10).fill("rlk_new"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("retries session 503 once but does not retry permanent 4xx", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(503, { error: { message: "starting" } }))
      .mockResolvedValueOnce(
        jsonResponse(200, { data: { token: "rlk_ready", expiresInSeconds: 1800 } })
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(ensureDemoSession()).resolves.toBe("rlk_ready");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    resetDemoSession();
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { error: { message: "forbidden" } }));
    await expect(ensureDemoSession()).rejects.toMatchObject({ status: 403 });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries a timed-out session once", async () => {
    vi.useFakeTimers();
    let firstAttempt = true;
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      if (firstAttempt) {
        firstAttempt = false;
        return new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("timed out", "AbortError"))
          );
        });
      }
      return Promise.resolve(
        jsonResponse(200, { data: { token: "rlk_timeout", expiresInSeconds: 1800 } })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const session = ensureDemoSession();
    await vi.advanceTimersByTimeAsync(45_000);
    await vi.advanceTimersByTimeAsync(250);

    await expect(session).resolves.toBe("rlk_timeout");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("request retry policy", () => {
  it("retries a safe GET once and never retries a mutation", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(503, { error: { message: "starting" } }))
      .mockResolvedValueOnce(jsonResponse(200, projectResponse));
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.projects()).resolves.toEqual(projectResponse);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fetchMock.mockResolvedValueOnce(jsonResponse(503, { error: { message: "starting" } }));
    await expect(
      api.createReplay("project-1", "event-1", { environmentId: "env-1" })
    ).rejects.toMatchObject({
      status: 503
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("stops a request when its caller aborts", async () => {
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError"))
          );
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const promise = api.projects(controller.signal);
    controller.abort();

    await expect(promise).rejects.toMatchObject({ status: 0 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
