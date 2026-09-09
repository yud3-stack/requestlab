import type { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { maskSensitiveData } from "../src/lib/masking.js";
import { hashApiKey } from "../src/lib/security.js";

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
      create: async () => ({})
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
