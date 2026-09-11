import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanupScannerEvents, isEnvScannerPath } from "./demo-cleanup-scanner.js";
import type { HealthCleanupDatabase } from "./demo-cleanup-health.js";

type EventRow = {
  id: string;
  projectId: string;
  method: string;
  statusCode: number;
  path: string;
};
type ReplayRow = { id: string; projectId: string; originalEventId: string };

function database(events: EventRow[], replays: ReplayRow[]) {
  const state = { events: [...events], replays: [...replays] };
  const operations: string[] = [];
  const db = {
    project: {
      findUnique: vi.fn(async ({ where }: { where: { slug: string } }) =>
        where.slug === "requestlab-demo" ? { id: "demo-project" } : null
      )
    },
    requestEvent: {
      findMany: vi.fn(
        async ({ where }: { where: { projectId: string; method: string; statusCode: number } }) =>
          state.events
            .filter(
              (event) =>
                event.projectId === where.projectId &&
                event.method === where.method &&
                event.statusCode === where.statusCode
            )
            .map(({ id, path }) => ({ id, path }))
      ),
      deleteMany: vi.fn(
        async ({
          where
        }: {
          where: {
            id: { in: string[] };
            projectId: string;
            method: string;
            statusCode: number;
          };
        }) => {
          operations.push("requestEvent.deleteMany");
          const ids = new Set(where.id.in);
          const before = state.events.length;
          state.events = state.events.filter(
            (event) =>
              !ids.has(event.id) ||
              event.projectId !== where.projectId ||
              event.method !== where.method ||
              event.statusCode !== where.statusCode
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
          operations.push("replayRun.deleteMany");
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
  return { db: db as unknown as HealthCleanupDatabase, state, operations };
}

afterEach(() => vi.restoreAllMocks());

describe("demo scanner cleanup", () => {
  it("recognizes scanner env segments without matching normal words", () => {
    expect(isEnvScannerPath("/.env")).toBe(true);
    expect(isEnvScannerPath("/api/.env.local")).toBe(true);
    expect(isEnvScannerPath("/config/.env.stage")).toBe(true);
    expect(isEnvScannerPath("/config/.env-dev?source=scanner")).toBe(true);
    expect(isEnvScannerPath("/.environment")).toBe(false);
    expect(isEnvScannerPath("/api/env.local")).toBe(false);
  });

  it("defaults to dry-run and does not delete scanner events", async () => {
    const fixture = database(
      [
        {
          id: "root-env",
          projectId: "demo-project",
          method: "GET",
          statusCode: 404,
          path: "/.env"
        },
        {
          id: "local-env",
          projectId: "demo-project",
          method: "GET",
          statusCode: 404,
          path: "/api/.env.local"
        },
        {
          id: "normal",
          projectId: "demo-project",
          method: "GET",
          statusCode: 404,
          path: "/api/orders/missing"
        }
      ],
      [{ id: "replay-root-env", projectId: "demo-project", originalEventId: "root-env" }]
    );
    const log = vi.fn();

    const result = await cleanupScannerEvents(fixture.db, "requestlab-demo", { apply: false, log });

    expect(result).toEqual({
      dryRun: true,
      targetEvents: 2,
      relatedReplayRuns: 1,
      deletedEvents: 0,
      deletedReplayRuns: 0
    });
    expect(fixture.state.events).toHaveLength(3);
    expect(fixture.state.replays).toHaveLength(1);
    expect(fixture.db.requestEvent.deleteMany).not.toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith(expect.stringContaining("2 target event(s)"));
  });

  it("applies only scanner-shaped 404 GET events from the configured project", async () => {
    const fixture = database(
      [
        {
          id: "root-env",
          projectId: "demo-project",
          method: "GET",
          statusCode: 404,
          path: "/.env"
        },
        {
          id: "stage-env",
          projectId: "demo-project",
          method: "GET",
          statusCode: 404,
          path: "/config/.env.stage"
        },
        {
          id: "query-env",
          projectId: "demo-project",
          method: "GET",
          statusCode: 404,
          path: "/api/.env-dev?source=scanner"
        },
        {
          id: "normal-word",
          projectId: "demo-project",
          method: "GET",
          statusCode: 404,
          path: "/.environment"
        },
        {
          id: "normal-404",
          projectId: "demo-project",
          method: "GET",
          statusCode: 404,
          path: "/api/orders/missing"
        },
        {
          id: "post-env",
          projectId: "demo-project",
          method: "POST",
          statusCode: 404,
          path: "/.env"
        },
        {
          id: "error-env",
          projectId: "demo-project",
          method: "GET",
          statusCode: 500,
          path: "/.env"
        },
        {
          id: "other-env",
          projectId: "other-project",
          method: "GET",
          statusCode: 404,
          path: "/.env"
        }
      ],
      [
        { id: "replay-root-env", projectId: "demo-project", originalEventId: "root-env" },
        { id: "replay-normal", projectId: "demo-project", originalEventId: "normal-404" },
        { id: "replay-other", projectId: "other-project", originalEventId: "other-env" }
      ]
    );

    const result = await cleanupScannerEvents(fixture.db, "requestlab-demo", { apply: true });

    expect(result).toMatchObject({
      dryRun: false,
      targetEvents: 3,
      relatedReplayRuns: 1,
      deletedEvents: 3,
      deletedReplayRuns: 1
    });
    expect(fixture.operations).toEqual(["replayRun.deleteMany", "requestEvent.deleteMany"]);
    expect(fixture.state.events.map((event) => event.id)).toEqual([
      "normal-word",
      "normal-404",
      "post-env",
      "error-env",
      "other-env"
    ]);
    expect(fixture.state.replays.map((replay) => replay.id)).toEqual([
      "replay-normal",
      "replay-other"
    ]);
  });
});
