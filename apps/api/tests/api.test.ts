import type { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { maskSensitiveData } from "../src/lib/masking.js";
import { hashApiKey } from "../src/lib/security.js";
import { createDemoToken } from "../src/lib/demo-session.js";

afterEach(() => vi.unstubAllGlobals());

const user = {
  id: "user-1",
  name: "Demo",
  email: "demo@example.com",
  createdAt: new Date(),
  updatedAt: new Date()
};
const environment = {
  id: "env-1",
  projectId: "project-1",
  name: "Development",
  slug: "development",
  type: "DEVELOPMENT",
  baseUrl: null,
  replayEnabled: true,
  createdAt: new Date(),
  updatedAt: new Date()
};
const event = {
  id: "event-1",
  externalEventId: "evt-1",
  projectId: "project-1",
  environmentId: "env-1",
  requestId: "req-1",
  method: "GET",
  path: "/orders",
  route: "/orders",
  query: {},
  requestHeaders: {},
  requestBody: null,
  responseHeaders: {},
  responseBody: null,
  statusCode: 500,
  durationMs: 20,
  errorType: "Error",
  errorMessage: "failed",
  stackTrace: null,
  occurredAt: new Date(),
  createdAt: new Date()
};

function dbMock(overrides: Record<string, unknown> = {}): PrismaClient {
  const base = {
    user: { findUnique: async () => user },
    project: {
      findMany: async () => [],
      findUnique: async () => ({
        id: "project-1",
        name: "Shop",
        slug: "shop",
        createdAt: new Date(),
        updatedAt: new Date()
      }),
      create: async () => ({
        id: "project-1",
        name: "Shop",
        slug: "shop",
        createdAt: new Date(),
        updatedAt: new Date()
      })
    },
    projectMember: {
      findUnique: async () => ({
        id: "member-1",
        userId: "user-1",
        projectId: "project-1",
        role: "OWNER",
        createdAt: new Date()
      }),
      create: async () => ({}),
      findFirst: async () => ({
        userId: "user-1",
        projectId: "project-1",
        role: "OWNER",
        createdAt: new Date()
      })
    },
    environment: {
      findUnique: async () => environment,
      findMany: async () => [environment],
      create: async () => environment
    },
    apiKey: {
      findMany: async () => [
        {
          id: "key-1",
          projectId: "project-1",
          keyPrefix: "rlk_test_key",
          keyHash: hashApiKey("rlk_test_key"),
          revokedAt: null,
          expiresAt: null
        }
      ],
      findFirst: async () => ({ id: "key-1", projectId: "project-1" }),
      update: async () => ({}),
      create: async () => ({
        id: "key-1",
        projectId: "project-1",
        name: "key",
        keyPrefix: "rlk_test_key",
        lastUsedAt: null,
        expiresAt: null,
        revokedAt: null,
        createdAt: new Date()
      })
    },
    auditEvent: { create: async () => ({}) },
    requestEvent: {
      create: async () => event,
      count: async () => 1,
      findMany: async () => [event],
      findFirst: async () => event
    },
    replayRun: {
      create: async () => ({
        id: "replay-1",
        projectId: "project-1",
        originalEventId: "event-1",
        environmentId: "env-1",
        requestedBy: "user-1",
        status: "QUEUED",
        method: "GET",
        targetUrl: "http://example.com/orders",
        requestHeaders: {},
        requestQuery: {},
        requestBody: null,
        responseHeaders: null,
        responseBody: null,
        statusCode: null,
        durationMs: null,
        errorMessage: null,
        startedAt: null,
        finishedAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      }),
      count: async () => 0,
      findMany: async () => [],
      findFirst: async () => null,
      update: async () => ({})
    },
    $transaction: async (callback: (transaction: unknown) => unknown) => callback(base)
  };
  return { ...base, ...overrides } as unknown as PrismaClient;
}

describe("sensitive data masking", () => {
  it("masks sensitive headers case-insensitively", () => {
    const input = { Authorization: "Bearer secret", cookie: "session", "x-trace": "ok" };
    expect(maskSensitiveData(input)).toEqual({
      Authorization: "[REDACTED]",
      cookie: "[REDACTED]",
      "x-trace": "ok"
    });
    expect(input.Authorization).toBe("Bearer secret");
  });

  it("masks nested objects and array items without mutating input", () => {
    const input = { user: { password: "secret" }, items: [{ accessToken: "token" }, { value: 2 }] };
    const output = maskSensitiveData(input);
    expect(output).toEqual({
      user: { password: "[REDACTED]" },
      items: [{ accessToken: "[REDACTED]" }, { value: 2 }]
    });
    expect(input.user.password).toBe("secret");
  });

  it("creates an event with masked values before persistence", async () => {
    let saved: Record<string, unknown> | undefined;
    const db = dbMock({
      requestEvent: {
        create: async (args: { data: Record<string, unknown> }) => {
          saved = args.data;
          return event;
        },
        count: async () => 0,
        findMany: async () => [],
        findFirst: async () => null
      }
    });
    const app = createApp({ db, config: { nodeEnv: "test", apiPort: 3001 } });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/events",
      headers: { "x-requestlab-key": "rlk_test_key" },
      payload: {
        externalEventId: "evt-safe",
        environment: "development",
        method: "POST",
        path: "/orders",
        requestHeaders: { Authorization: "secret" },
        requestBody: { values: [{ password: "secret" }] },
        statusCode: 500,
        occurredAt: new Date().toISOString()
      }
    });
    expect(response.statusCode).toBe(201);
    expect(saved?.requestHeaders).toEqual({ Authorization: "[REDACTED]" });
    expect(saved?.requestBody).toEqual({ values: [{ password: "[REDACTED]" }] });
    await app.close();
  });
});

describe("production public demo boundaries", () => {
  const config = {
    nodeEnv: "production",
    apiPort: 3001,
    demoSessionSecret: "test-only-demo-secret",
    demoProjectSlug: "shop",
    rateLimits: { demoSession: 10, demoScenario: 20, replayCreate: 10, authenticated: 120 }
  };

  it("ignores the development user header in production", async () => {
    const app = createApp({ db: dbMock(), config });
    const response = await app.inject({
      method: "GET",
      url: "/api/projects",
      headers: { "x-requestlab-user-id": "user-1" }
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("creates a scoped expiring demo session without accepting identity input", async () => {
    const app = createApp({ db: dbMock(), config });
    const session = await app.inject({
      method: "POST",
      url: "/api/demo/session",
      payload: { projectId: "other", role: "OWNER" }
    });
    expect(session.statusCode).toBe(200);
    expect(session.json().data.project.slug).toBe("shop");
    const token = session.json().data.token as string;
    const projects = await app.inject({
      method: "GET",
      url: "/api/projects",
      headers: { authorization: `Bearer ${token}` }
    });
    expect(projects.statusCode).toBe(200);
    const forbidden = await app.inject({
      method: "GET",
      url: "/api/projects/other",
      headers: { authorization: `Bearer ${token}` }
    });
    expect(forbidden.statusCode).toBe(403);
    const keys = await app.inject({
      method: "GET",
      url: "/api/projects/project-1/api-keys",
      headers: { authorization: `Bearer ${token}` }
    });
    expect(keys.statusCode).toBe(403);
    await app.close();
  });

  it("marks the public demo unavailable when its required configuration is missing", async () => {
    const cases = [
      { db: dbMock(), config: { ...config, demoSessionSecret: undefined } },
      { db: dbMock({ project: { findUnique: async () => null } }), config },
      { db: dbMock({ projectMember: { findFirst: async () => null } }), config }
    ];
    for (const options of cases) {
      const app = createApp(options);
      const response = await app.inject({ method: "POST", url: "/api/demo/session" });
      expect(response.statusCode).toBe(503);
      expect(response.json().error.code).toBe("DEMO_UNAVAILABLE");
      await app.close();
    }
  });

  it("rejects expired and malformed demo tokens and unknown scenarios", async () => {
    const app = createApp({
      db: dbMock(),
      config: { ...config, demoApiBaseUrl: "https://demo.example.test" }
    });
    const expired = createDemoToken(
      { sub: "user-1", projectId: "project-1", exp: Date.now() - 1 },
      config.demoSessionSecret
    );
    const expiredResponse = await app.inject({
      method: "POST",
      url: "/api/demo/scenarios/order-error",
      headers: { authorization: `Bearer ${expired}` }
    });
    expect(expiredResponse.statusCode).toBe(401);
    const unknown = await app.inject({
      method: "POST",
      url: "/api/demo/scenarios/arbitrary",
      headers: { authorization: "Bearer invalid" }
    });
    expect(unknown.statusCode).toBe(401);
    await app.close();
  });

  it("preserves expected demo scenario failure statuses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        expect(init.method).toBe("POST");
        return new Response(JSON.stringify({ data: { statusCode: 500 } }), { status: 500 });
      })
    );
    const app = createApp({
      db: dbMock(),
      config: {
        ...config,
        demoApiBaseUrl: "https://demo.example.test",
        demoTriggerSecret: "trigger"
      }
    });
    const token = createDemoToken(
      { sub: "user-1", projectId: "project-1", exp: Date.now() + 60_000 },
      config.demoSessionSecret
    );
    const response = await app.inject({
      method: "POST",
      url: "/api/demo/scenarios/order-error",
      headers: { authorization: `Bearer ${token}` }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.statusCode).toBe(500);
    await app.close();
  });

  it("returns the common 429 response when the authenticated limit is exceeded", async () => {
    const app = createApp({
      db: dbMock(),
      config: { ...config, rateLimits: { ...config.rateLimits, authenticated: 1 } }
    });
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/projects",
          headers: { authorization: "Bearer invalid" }
        })
      ).statusCode
    ).toBe(401);
    const limited = await app.inject({
      method: "GET",
      url: "/api/projects",
      headers: { authorization: "Bearer invalid" }
    });
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error.code).toBe("RATE_LIMITED");
    await app.close();
  });
});

describe("event API authorization and isolation", () => {
  it("returns 401 for an invalid ingestion key", async () => {
    const db = dbMock({ apiKey: { findMany: async () => [], update: async () => ({}) } });
    const app = createApp({ db, config: { nodeEnv: "test", apiPort: 3001 } });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/events",
      headers: { "x-requestlab-key": "rlk_invalid" },
      payload: {}
    });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("rejects an environment outside the ingestion key project", async () => {
    const db = dbMock({ environment: { findUnique: async () => null } });
    const app = createApp({ db, config: { nodeEnv: "test", apiPort: 3001 } });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/events",
      headers: { "x-requestlab-key": "rlk_test_key" },
      payload: {
        externalEventId: "evt-1",
        environment: "other",
        method: "GET",
        path: "/",
        statusCode: 500,
        occurredAt: new Date().toISOString()
      }
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("maps a duplicate external event to 409", async () => {
    const db = dbMock({
      requestEvent: {
        create: async () => {
          throw { code: "P2002" };
        },
        count: async () => 0,
        findMany: async () => [],
        findFirst: async () => null
      }
    });
    const app = createApp({ db, config: { nodeEnv: "test", apiPort: 3001 } });
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/events",
      headers: { "x-requestlab-key": "rlk_test_key" },
      payload: {
        externalEventId: "evt-1",
        environment: "development",
        method: "GET",
        path: "/",
        statusCode: 500,
        occurredAt: new Date().toISOString()
      }
    });
    expect(response.statusCode).toBe(409);
    await app.close();
  });

  it("returns 403 to a non-member listing events", async () => {
    const db = dbMock({ projectMember: { findUnique: async () => null } });
    const app = createApp({ db, config: { nodeEnv: "test", apiPort: 3001 } });
    const response = await app.inject({
      method: "GET",
      url: "/api/projects/project-1/events",
      headers: { "x-requestlab-user-id": "user-1" }
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("prevents a viewer from creating API keys", async () => {
    const db = dbMock({
      projectMember: {
        findUnique: async () => ({
          id: "member-1",
          userId: "user-1",
          projectId: "project-1",
          role: "VIEWER",
          createdAt: new Date()
        })
      }
    });
    const app = createApp({ db, config: { nodeEnv: "test", apiPort: 3001 } });
    const response = await app.inject({
      method: "POST",
      url: "/api/projects/project-1/api-keys",
      headers: { "x-requestlab-user-id": "user-1" },
      payload: { name: "blocked" }
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("does not use a default user in production", async () => {
    const app = createApp({
      db: dbMock(),
      config: { nodeEnv: "production", devUserId: "user-1", apiPort: 3001 }
    });
    const response = await app.inject({ method: "GET", url: "/api/projects" });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it("caps page size and omits body fields from summaries", async () => {
    let receivedTake = 0;
    const db = dbMock({
      requestEvent: {
        create: async () => event,
        count: async () => 1,
        findMany: async (args: { take: number }) => {
          receivedTake = args.take;
          return [event];
        },
        findFirst: async () => event
      }
    });
    const app = createApp({ db, config: { nodeEnv: "test", apiPort: 3001 } });
    const response = await app.inject({
      method: "GET",
      url: "/api/projects/project-1/events?pageSize=999",
      headers: { "x-requestlab-user-id": "user-1" }
    });
    expect(response.statusCode).toBe(200);
    expect(receivedTake).toBe(100);
    expect(response.json().data[0].requestBody).toBeUndefined();
    await app.close();
  });
});

describe("CORS and development identity", () => {
  it("handles an allowed preflight and advertises the user header", async () => {
    const app = createApp({
      db: dbMock(),
      config: {
        nodeEnv: "development",
        apiPort: 3001,
        corsAllowedOrigins: ["http://localhost:5173", "http://127.0.0.1:5173"]
      }
    });
    const response = await app.inject({
      method: "OPTIONS",
      url: "/api/projects",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "GET",
        "access-control-request-headers": "x-requestlab-user-id"
      }
    });
    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(response.headers["access-control-allow-headers"]).toContain("X-RequestLab-User-Id");
    await app.close();
  });

  it("includes CORS headers on an unauthorized response and denies unknown origins", async () => {
    const app = createApp({
      db: dbMock(),
      config: {
        nodeEnv: "development",
        apiPort: 3001,
        corsAllowedOrigins: ["http://localhost:5173"]
      }
    });
    const allowed = await app.inject({
      method: "GET",
      url: "/api/projects",
      headers: { origin: "http://localhost:5173" }
    });
    expect(allowed.statusCode).toBe(401);
    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:5173");

    const denied = await app.inject({
      method: "OPTIONS",
      url: "/api/projects",
      headers: {
        origin: "http://evil.example",
        "access-control-request-method": "GET"
      }
    });
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
    await app.close();
  });

  it("uses the supplied development identity for project listing", async () => {
    const db = dbMock({
      user: { findUnique: async ({ where }: { where: { id: string } }) => ({ id: where.id }) },
      project: { findMany: async () => [] }
    });
    const app = createApp({
      db,
      config: { nodeEnv: "development", devUserId: "seed-user-id", apiPort: 3001 }
    });
    const response = await app.inject({ method: "GET", url: "/api/projects" });
    expect(response.statusCode).toBe(200);
    await app.close();
  });
});

describe("replay API authorization", () => {
  const queue = { add: async () => undefined, close: async () => undefined };
  const replayRequest = {
    method: "POST" as const,
    url: "/api/projects/project-1/events/event-1/replays",
    headers: { "x-requestlab-user-id": "user-1" },
    payload: { environmentId: "env-1", confirmSideEffects: true }
  };

  it("allows developers and records a queued replay", async () => {
    let auditAction = "";
    const db = dbMock({
      environment: {
        findUnique: async () => ({ ...environment, baseUrl: "https://example.com", type: "TEST" })
      },
      auditEvent: {
        create: async ({ data }: { data: { action: string } }) => {
          auditAction = data.action;
        }
      }
    });
    const app = createApp({ db, replayQueue: queue, config: { nodeEnv: "test", apiPort: 3001 } });
    const response = await app.inject(replayRequest);
    expect(response.statusCode).toBe(202);
    expect(response.json().data.status).toBe("QUEUED");
    expect(auditAction).toBe("REPLAY_CREATED");
    await app.close();
  });

  it("rejects viewers, production, disabled environments and unconfirmed side effects", async () => {
    const viewer = createApp({
      db: dbMock({
        projectMember: {
          findUnique: async () => ({ userId: "user-1", projectId: "project-1", role: "VIEWER" })
        }
      }),
      replayQueue: queue,
      config: { nodeEnv: "test", apiPort: 3001 }
    });
    expect((await viewer.inject(replayRequest)).statusCode).toBe(403);
    await viewer.close();

    for (const environmentOverride of [
      { ...environment, baseUrl: "https://example.com", type: "PRODUCTION", replayEnabled: true },
      { ...environment, baseUrl: "https://example.com", type: "TEST", replayEnabled: false }
    ]) {
      const app = createApp({
        db: dbMock({ environment: { findUnique: async () => environmentOverride } }),
        replayQueue: queue,
        config: { nodeEnv: "test", apiPort: 3001 }
      });
      expect((await app.inject(replayRequest)).statusCode).toBe(400);
      await app.close();
    }

    const app = createApp({
      db: dbMock({
        environment: {
          findUnique: async () => ({ ...environment, baseUrl: "https://example.com" })
        },
        requestEvent: { findFirst: async () => ({ ...event, method: "POST" }) }
      }),
      replayQueue: queue,
      config: { nodeEnv: "test", apiPort: 3001 }
    });
    expect(
      (await app.inject({ ...replayRequest, payload: { environmentId: "env-1" } })).statusCode
    ).toBe(400);
    await app.close();
  });

  it("returns unavailable and marks the run failed when queueing fails", async () => {
    let updated = false;
    const app = createApp({
      db: dbMock({
        environment: {
          findUnique: async () => ({ ...environment, baseUrl: "https://example.com" })
        },
        replayRun: {
          ...dbMock().replayRun,
          update: async () => {
            updated = true;
          }
        }
      }),
      replayQueue: {
        add: async () => {
          throw new Error("redis down");
        },
        close: async () => undefined
      },
      config: { nodeEnv: "test", apiPort: 3001 }
    });
    expect((await app.inject(replayRequest)).statusCode).toBe(503);
    expect(updated).toBe(true);
    await app.close();
  });
});
