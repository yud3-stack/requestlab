// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { App, diffJson, durationDelta } from "../src/main";
import { api, ApiError, ensureDemoSession } from "../src/api";

vi.mock("../src/api", async () => {
  return {
    ApiError: class extends Error {
      status: number;
      constructor(status: number, message: string) {
        super(message);
        this.status = status;
      }
    },
    ensureDemoSession: vi.fn(),
    resetDemoSession: vi.fn(),
    api: {
      projects: vi.fn(),
      environments: vi.fn(),
      health: vi.fn(),
      stats: vi.fn(),
      events: vi.fn(),
      event: vi.fn(),
      keys: vi.fn(),
      createReplay: vi.fn(),
      replays: vi.fn(),
      replay: vi.fn()
    }
  };
});

const project = {
  id: "p1",
  name: "Shop API",
  slug: "shop-api",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z"
};
const environment = {
  id: "e1",
  projectId: "p1",
  name: "Test",
  slug: "test",
  type: "TEST",
  baseUrl: null,
  replayEnabled: true,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z"
};
const production = {
  ...environment,
  id: "prod",
  name: "Production",
  type: "PRODUCTION",
  replayEnabled: true
};
const disabledEnvironment = {
  ...environment,
  id: "disabled",
  name: "Disabled",
  type: "TEST",
  replayEnabled: false
};
const event = {
  id: "evt1",
  externalEventId: "external",
  environmentId: "e1",
  requestId: "req1",
  method: "POST",
  path: "/api/orders",
  route: "/api/orders",
  statusCode: 500,
  durationMs: 142,
  errorType: "ShippingAddressError",
  errorMessage: "Missing address",
  occurredAt: "2026-01-01T12:00:00Z",
  createdAt: "2026-01-01T12:00:00Z"
};
const stats = {
  totalRequests: 4,
  errorCount: 2,
  errorRate: 0.5,
  averageDurationMs: 80,
  statusDistribution: [
    { statusCode: 200, count: 2 },
    { statusCode: 500, count: 2 }
  ],
  topEndpoints: [{ path: "/api/orders", count: 2, errorCount: 2 }],
  recentErrors: [event]
};

function renderApp(initial = "/", demoMode = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initial]}>
        <App demoMode={demoMode} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}
function setup() {
  vi.mocked(api.projects).mockResolvedValue({ data: [project] });
  vi.mocked(api.environments).mockResolvedValue({
    data: [environment, production, disabledEnvironment]
  });
  vi.mocked(api.health).mockResolvedValue({ status: "ok", service: "api" });
  vi.mocked(api.stats).mockResolvedValue({ data: stats });
  vi.mocked(api.events).mockResolvedValue({
    data: [event],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 }
  });
  vi.mocked(api.event).mockResolvedValue({
    data: {
      ...event,
      requestHeaders: { authorization: "[REDACTED]" },
      requestBody: { password: "[REDACTED]", token: "[REDACTED]" },
      responseHeaders: {},
      responseBody: {},
      query: {},
      stackTrace: null
    }
  });
  vi.mocked(api.keys).mockResolvedValue({
    data: [
      {
        id: "k1",
        projectId: "p1",
        name: "Development",
        keyPrefix: "rlk_safe",
        lastUsedAt: null,
        expiresAt: null,
        revokedAt: null,
        createdAt: "2026-01-01T00:00:00Z"
      }
    ]
  });
  vi.mocked(api.createReplay).mockResolvedValue({
    data: {
      id: "replay-1",
      originalEventId: "evt1",
      environmentId: "e1",
      requestedBy: "user-1",
      status: "QUEUED",
      method: "POST",
      targetUrl: "http://localhost:3002/api/orders",
      statusCode: null,
      durationMs: null,
      errorMessage: null,
      startedAt: null,
      finishedAt: null,
      createdAt: "2026-01-01T12:01:00Z"
    }
  });
}

afterEach(cleanup);
afterEach(() => vi.useRealTimers());
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  setup();
});

describe("dashboard", () => {
  it("shows loading state", () => {
    vi.mocked(api.projects).mockReturnValue(new Promise(() => undefined));
    renderApp();
    expect(screen.getByText("Projeler yükleniyor...")).toBeInTheDocument();
  });
  it("waits for the demo session before loading projects", async () => {
    let resolveSession: ((token: string) => void) | undefined;
    vi.mocked(ensureDemoSession).mockReturnValue(
      new Promise<string>((resolve) => {
        resolveSession = resolve;
      })
    );
    renderApp("/", true);
    expect(api.projects).not.toHaveBeenCalled();

    resolveSession?.("rlk_test_session");
    await waitFor(() => expect(api.projects).toHaveBeenCalledTimes(1));
  });
  it("shows a cold-start message after a few seconds", () => {
    vi.useFakeTimers();
    vi.mocked(ensureDemoSession).mockReturnValue(new Promise(() => undefined));
    renderApp("/", true);
    expect(screen.getByText("Projeler yükleniyor...")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(2_500));
    expect(
      screen.getByText(
        "Ücretsiz demo servisi başlatılıyor. Bu işlem ilk açılışta birkaç saniye sürebilir."
      )
    ).toBeInTheDocument();
  });
  it("retries a failed startup without reloading the page", async () => {
    vi.mocked(ensureDemoSession)
      .mockRejectedValueOnce(new ApiError(408, "İstek zaman aşımına uğradı."))
      .mockResolvedValueOnce("rlk_test_session");
    renderApp("/", true);
    fireEvent.click(await screen.findByRole("button", { name: "Tekrar Dene" }));
    await waitFor(() => expect(ensureDemoSession).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("Toplam istek")).toBeInTheDocument();
  });
  it("shows real overview data", async () => {
    renderApp();
    expect(await screen.findByText("Toplam istek")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });
  it("shows an understandable API error", async () => {
    vi.mocked(api.projects).mockRejectedValue(new Error("offline"));
    renderApp();
    expect(await screen.findByText("Project verisi alınamadı")).toBeInTheDocument();
  });
  it("renders empty requests state", async () => {
    vi.mocked(api.events).mockResolvedValue({
      data: [],
      pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 }
    });
    renderApp("/requests");
    expect(await screen.findByText("Henüz event bulunmuyor")).toBeInTheDocument();
  });
  it("opens event detail and switches request/response tabs", async () => {
    renderApp("/requests");
    expect(await screen.findByText("/api/orders")).toBeInTheDocument();
    fireEvent.click(screen.getByText("/api/orders"));
    expect(await screen.findByText("İstek detayı")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "Request" }));
    expect(await screen.findByText("Headers")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Response" }));
    expect(await screen.findByText("Body")).toBeInTheDocument();
  });
  it("renders redacted values and never renders an API key", async () => {
    renderApp("/settings");
    expect(await screen.findByText("rlk_safe••••")).toBeInTheDocument();
    expect(screen.queryByText(/plaintext|secret/i)).not.toBeInTheDocument();
  });
  it("opens and closes the mobile menu", async () => {
    renderApp();
    const open = (await screen.findAllByRole("button", { name: "Menüyü aç" }))[0];
    fireEvent.click(open);
    expect(document.querySelector(".sidebar.open")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "Menüyü kapat" })[0]);
    await waitFor(() => expect(document.querySelector(".sidebar.open")).not.toBeInTheDocument());
  });
  it("opens the replay form and requires confirmation for POST", async () => {
    renderApp("/requests");
    fireEvent.click(await screen.findByText("/api/orders"));
    const replayButton = await screen.findByRole("button", {
      name: /Test ortamında tekrar çalıştır/
    });
    await waitFor(() => expect(replayButton).not.toBeDisabled());
    fireEvent.click(replayButton);
    expect(await screen.findByRole("heading", { name: "Tekrar çalıştır" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Replay başlat" }));
    expect(await screen.findByText("Yan etki onayı gerekli.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /Bu isteğin test ortamındaki verileri/ }));
    fireEvent.click(screen.getByRole("button", { name: "Replay başlat" }));
    await waitFor(() => expect(api.createReplay).toHaveBeenCalledTimes(1));
  });
  it("does not offer production or disabled replay environments", async () => {
    renderApp("/requests");
    fireEvent.click(await screen.findByText("/api/orders"));
    const replayButton = await screen.findByRole("button", {
      name: /Test ortamında tekrar çalıştır/
    });
    await waitFor(() => expect(replayButton).not.toBeDisabled());
    fireEvent.click(replayButton);
    const environmentSelect = screen.getByRole("combobox", { name: "Hedef environment" });
    expect(environmentSelect).toHaveValue("e1");
    expect(
      within(environmentSelect).queryByRole("option", { name: /Production/ })
    ).not.toBeInTheDocument();
    expect(
      within(environmentSelect).queryByRole("option", { name: /Disabled/ })
    ).not.toBeInTheDocument();
  });
  it("computes safe JSON changes and duration deltas", () => {
    expect(diffJson({ a: 1 }, { a: 2, b: true }).map((entry) => entry.kind)).toEqual([
      "changed",
      "added"
    ]);
    expect(durationDelta(324, 186)).toBe("-138 ms (-43%)");
  });
});
