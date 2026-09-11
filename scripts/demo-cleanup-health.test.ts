import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cleanupHealthEvents,
  type HealthCleanupDatabase,
  validateDemoProjectSlug
} from "./demo-cleanup-health.js";

type EventRow = { id: string; projectId: string; path: string };
type ReplayRow = { id: string; projectId: string; originalEventId: string };

function database(events: EventRow[], replays: ReplayRow[]) {
  const state = { events: [...events], replays: [...replays] };
  const db = {
    project: {
      findUnique: vi.fn(async ({ where }: { where: { slug: string } }) =>
        where.slug === "requestlab-demo" ? { id: "demo-project" } : null
      )
    },
    requestEvent: {
      findMany: vi.fn(async ({ where }: { where: { projectId: string; path: string } }) =>
        state.events
          .filter((event) => event.projectId === where.projectId && event.path === where.path)
          .map(({ id }) => ({ id }))
      ),
      deleteMany: vi.fn(
        async ({ where }: { where: { id: { in: string[] }; projectId: string; path: string } }) => {
          const ids = new Set(where.id.in);
          const before = state.events.length;
          state.events = state.events.filter(
            (event) =>
              !ids.has(event.id) || event.projectId !== where.projectId || event.path !== where.path
          );
          return { count: before - state.events.length };
        }
      )
    },
    replayRun: {
      count: vi.fn(
        async ({ where }: { where: { projectId: string; originalEventId: { in: string[] } } }) =>
          state.replays.filter(
            (replay) =>
              replay.projectId === where.projectId &&
              where.originalEventId.in.includes(replay.originalEventId)
          ).length
      ),
      deleteMany: vi.fn(
        async ({ where }: { where: { projectId: string; originalEventId: { in: string[] } } }) => {
          const ids = new Set(where.originalEventId.in);
          const before = state.replays.length;
          state.replays = state.replays.filter(
            (replay) => replay.projectId !== where.projectId || !ids.has(replay.originalEventId)
          );
          return { count: before - state.replays.length };
        }
      )
    },
    $transaction: async <T>(
      callback: (transaction: Omit<HealthCleanupDatabase, "$transaction">) => Promise<T>
    ) => await callback(db as unknown as Omit<HealthCleanupDatabase, "$transaction">)
  };
  return { db: db as unknown as HealthCleanupDatabase, state };
}

afterEach(() => vi.restoreAllMocks());

describe("demo health cleanup", () => {
  it("defaults to dry-run without deleting data", async () => {
    const fixture = database(
      [
        { id: "health", projectId: "demo-project", path: "/health" },
        { id: "products", projectId: "demo-project", path: "/api/products" }
      ],
      [{ id: "replay-health", projectId: "demo-project", originalEventId: "health" }]
    );
    const log = vi.fn();

    const result = await cleanupHealthEvents(fixture.db, "requestlab-demo", { apply: false, log });

    expect(result).toEqual({
      dryRun: true,
      targetEvents: 1,
      relatedReplayRuns: 1,
      deletedEvents: 0,
      deletedReplayRuns: 0
    });
    expect(fixture.state.events).toHaveLength(2);
    expect(fixture.state.replays).toHaveLength(1);
    expect(fixture.db.requestEvent.deleteMany).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("1 target event(s)"));
  });

  it("applies only exact health events from the configured project", async () => {
    const fixture = database(
      [
        { id: "health", projectId: "demo-project", path: "/health" },
        { id: "health-query", projectId: "demo-project", path: "/health?source=render" },
        { id: "health-check", projectId: "demo-project", path: "/health-check" },
        { id: "other-health", projectId: "other-project", path: "/health" },
        { id: "orders", projectId: "demo-project", path: "/api/orders" }
      ],
      [
        { id: "replay-health", projectId: "demo-project", originalEventId: "health" },
        { id: "replay-orders", projectId: "demo-project", originalEventId: "orders" },
        { id: "replay-other", projectId: "other-project", originalEventId: "health" }
      ]
    );

    const result = await cleanupHealthEvents(fixture.db, "requestlab-demo", { apply: true });

    expect(result).toMatchObject({
      dryRun: false,
      targetEvents: 1,
      relatedReplayRuns: 1,
      deletedEvents: 1,
      deletedReplayRuns: 1
    });
    expect(fixture.state.events.map((event) => event.id)).toEqual([
      "health-query",
      "health-check",
      "other-health",
      "orders"
    ]);
    expect(fixture.state.replays.map((replay) => replay.id)).toEqual([
      "replay-orders",
      "replay-other"
    ]);
  });

  it("rejects missing or wildcard project slugs", () => {
    expect(() => validateDemoProjectSlug(undefined)).toThrow();
    expect(() => validateDemoProjectSlug("*")).toThrow();
    expect(() => validateDemoProjectSlug("demo/project")).toThrow();
  });

  it("does not start a cleanup transaction when the project is missing", async () => {
    const fixture = database([{ id: "health", projectId: "other-project", path: "/health" }], []);

    await expect(
      cleanupHealthEvents(fixture.db, "missing-project", { apply: true })
    ).rejects.toThrow("Demo project was not found");
    expect(fixture.db.requestEvent.deleteMany).not.toHaveBeenCalled();
  });
});
