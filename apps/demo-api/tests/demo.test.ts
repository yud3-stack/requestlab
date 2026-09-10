import { afterEach, describe, expect, it, vi } from "vitest";
import { createDemoApp } from "../src/app.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("demo API scenarios", () => {
  it("serves products and an existing order", async () => {
    const app = createDemoApp({ logger: false });
    expect((await app.inject({ method: "GET", url: "/api/products" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/orders/order-1" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/api/orders/missing" })).statusCode).toBe(404);
    await app.close();
  });

  it("creates orders, rejects invalid quantity and returns the shipping error", async () => {
    const app = createDemoApp({ logger: false });
    const valid = await app.inject({
      method: "POST",
      url: "/api/orders",
      payload: { productId: "product-1", quantity: 1, shippingAddress: { city: "Istanbul" } }
    });
    const invalidQuantity = await app.inject({
      method: "POST",
      url: "/api/orders",
      payload: { productId: "product-1", quantity: 0, shippingAddress: { city: "Istanbul" } }
    });
    const missingAddress = await app.inject({
      method: "POST",
      url: "/api/orders",
      payload: { productId: "product-1", quantity: 1 }
    });
    expect(valid.statusCode).toBe(201);
    expect(invalidQuantity.statusCode).toBe(400);
    expect(missingAddress.statusCode).toBe(500);
    await app.close();
  });

  it("does not create a second order for an idempotency key", async () => {
    const app = createDemoApp({ logger: false });
    const payload = { productId: "product-1", quantity: 1, shippingAddress: { city: "Istanbul" } };
    const first = await app.inject({
      method: "POST",
      url: "/api/orders",
      headers: { "idempotency-key": "order-key" },
      payload
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/orders",
      headers: { "idempotency-key": "order-key" },
      payload
    });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(200);
    expect(second.json().data.id).toBe(first.json().data.id);
    await app.close();
  });

  it("supports login, slow requests and scenario discovery", async () => {
    const app = createDemoApp({ logger: false });
    const login = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "demo@example.com", password: "secret-value" }
    });
    const invalidLogin = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "demo@example.com", password: "wrong" }
    });
    const slow = await app.inject({ method: "GET", url: "/api/demo/slow?delayMs=1" });
    const scenarios = await app.inject({ method: "GET", url: "/api/demo/scenarios" });
    expect(login.statusCode).toBe(200);
    expect(invalidLogin.statusCode).toBe(401);
    expect(slow.statusCode).toBe(200);
    expect(scenarios.json().data.length).toBeGreaterThanOrEqual(5);
    await app.close();
  });

  it("captures successful, failed and slow scenarios through the SDK", async () => {
    const sent: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        sent.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        return new Response("{}", { status: 201 });
      })
    );
    const app = createDemoApp({
      logger: false,
      requestLab: {
        apiUrl: "http://requestlab.test",
        apiKey: "rlk_demo",
        environment: "development",
        captureMode: "all"
      }
    });
    await app.ready();
    expect(app.requestLab).toBeDefined();
    await app.inject({
      method: "GET",
      url: "/api/products",
      headers: { "x-request-id": "demo-request-id" }
    });
    await app.inject({
      method: "POST",
      url: "/api/orders",
      payload: { productId: "product-1", quantity: 1 }
    });
    await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "demo@example.com", password: "wrong" }
    });
    await app.inject({ method: "GET", url: "/api/demo/slow?delayMs=1" });
    await app.requestLab?.flush();
    expect(sent.some((event) => event.path === "/api/products" && event.statusCode === 200)).toBe(
      true
    );
    const failedOrder = sent.find((event) => event.path === "/api/orders");
    expect(failedOrder?.statusCode).toBe(500);
    expect(
      (failedOrder?.requestBody as { password?: string } | undefined)?.password
    ).toBeUndefined();
    const login = sent.find((event) => event.path === "/api/auth/login");
    expect(login?.statusCode).toBe(401);
    expect((login?.requestBody as { password?: string } | undefined)?.password).toBe("[REDACTED]");
    const slow = sent.find((event) => event.path === "/api/demo/slow");
    expect(slow?.durationMs).toBeGreaterThanOrEqual(0);
    expect(sent.some((event) => event.requestId === "demo-request-id")).toBe(true);
    await app.close();
  });

  it("protects the server-side scenario trigger and accepts only predefined scenarios", async () => {
    const app = createDemoApp({
      logger: false,
      nodeEnv: "production",
      triggerSecret: "trigger-test"
    });
    const unauthorized = await app.inject({
      method: "POST",
      url: "/internal/demo/scenarios/order-error"
    });
    const error = await app.inject({
      method: "POST",
      url: "/internal/demo/scenarios/order-error",
      headers: { "x-requestlab-demo-secret": "wrong" }
    });
    const order = await app.inject({
      method: "POST",
      url: "/internal/demo/scenarios/order-error",
      headers: { "x-requestlab-demo-secret": "trigger-test" },
      payload: { arbitrary: true }
    });
    const unknown = await app.inject({
      method: "POST",
      url: "/internal/demo/scenarios/arbitrary",
      headers: { "x-requestlab-demo-secret": "trigger-test" }
    });
    expect(unauthorized.statusCode).toBe(401);
    expect(error.statusCode).toBe(401);
    expect(order.statusCode).toBe(500);
    expect(unknown.statusCode).toBe(404);
    await app.close();
  });
});
