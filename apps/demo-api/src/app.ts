import Fastify, { type FastifyInstance } from "fastify";
import type { ServiceHealth } from "@requestlab/shared";
import {
  installRequestLabHooks,
  RequestLabClient,
  type RequestLabOptions
} from "@requestlab/sdk-node";
import { randomUUID } from "node:crypto";

type Product = { id: string; name: string; price: number; stock: number };
type Order = {
  id: string;
  productId: string;
  quantity: number;
  shippingAddress: Record<string, string>;
};

export class DemoError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = code;
  }
}

export type DemoAppOptions = {
  requestLab?: RequestLabOptions;
  logger?: boolean;
};

const products: Product[] = [
  { id: "product-1", name: "RequestLab T-Shirt", price: 29.99, stock: 25 },
  { id: "product-2", name: "Debug Notebook", price: 12.5, stock: 100 },
  { id: "product-3", name: "API Mug", price: 18, stock: 40 }
];

export function createDemoApp(options: DemoAppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: options.logger ?? true });
  const orders = new Map<string, Order>([
    [
      "order-1",
      {
        id: "order-1",
        productId: "product-1",
        quantity: 1,
        shippingAddress: { city: "Istanbul", district: "Kadikoy", addressLine: "Demo address" }
      }
    ]
  ]);
  const idempotencyResults = new Map<string, Order>();

  if (options.requestLab) {
    const requestLab = new RequestLabClient(options.requestLab);
    app.decorate("requestLab", requestLab);
    installRequestLabHooks(app, requestLab);
  }

  app.get<{ Reply: ServiceHealth }>("/health", async () => ({ status: "ok", service: "demo-api" }));

  app.get("/api/products", async () => ({ data: products }));

  app.get<{ Params: { id: string } }>("/api/orders/:id", async (request, reply) => {
    const order = orders.get(request.params.id);
    if (!order)
      return reply
        .status(404)
        .send({ error: { code: "ORDER_NOT_FOUND", message: "Order was not found" } });
    return { data: order };
  });

  app.post("/api/orders", async (request, reply) => {
    const body = request.body as Partial<Order> | null;
    if (!body || typeof body !== "object")
      throw new DemoError(400, "INVALID_ORDER", "Order body is required");
    const quantity = body.quantity;
    if (
      typeof quantity !== "number" ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 10
    ) {
      throw new DemoError(400, "INVALID_QUANTITY", "Quantity must be an integer between 1 and 10");
    }
    const product = products.find((item) => item.id === body.productId);
    if (!product) throw new DemoError(400, "PRODUCT_NOT_FOUND", "Product was not found");
    const idempotencyKey = getHeader(request.headers["idempotency-key"]);
    if (idempotencyKey) {
      const existing = idempotencyResults.get(idempotencyKey);
      if (existing) return reply.status(200).send({ data: existing, idempotent: true });
    }
    if (!body.shippingAddress || typeof body.shippingAddress !== "object") {
      throw new DemoError(500, "ShippingAddressError", "Shipping address is required");
    }
    const order: Order = {
      id: `order-${randomUUID()}`,
      productId: product.id,
      quantity,
      shippingAddress: body.shippingAddress as Record<string, string>
    };
    orders.set(order.id, order);
    if (idempotencyKey) idempotencyResults.set(idempotencyKey, order);
    return reply.status(201).send({ data: order });
  });

  app.post("/api/auth/login", async (request, reply) => {
    const body = request.body as { email?: unknown; password?: unknown } | null;
    if (body?.email !== "demo@example.com" || body.password !== "secret-value") {
      throw new DemoError(401, "INVALID_CREDENTIALS", "Invalid email or password");
    }
    return reply.status(200).send({ data: { user: { email: body.email }, token: "demo-token" } });
  });

  app.get<{ Querystring: { delayMs?: string } }>("/api/demo/slow", async (request) => {
    const parsed = Number(request.query.delayMs ?? 500);
    const delayMs = Number.isFinite(parsed) ? Math.min(Math.max(Math.floor(parsed), 0), 3000) : 500;
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    return { data: { delayMs, completed: true } };
  });

  app.get("/api/demo/scenarios", async () => ({
    data: [
      {
        name: "products",
        description: "List sample products",
        endpoint: "GET /api/products",
        expectedStatus: 200
      },
      {
        name: "missing-order",
        description: "Request an unknown order",
        endpoint: "GET /api/orders/:id",
        expectedStatus: 404
      },
      {
        name: "shipping-address-error",
        description: "Create an order without an address",
        endpoint: "POST /api/orders",
        expectedStatus: 500
      },
      {
        name: "invalid-login",
        description: "Use invalid login credentials",
        endpoint: "POST /api/auth/login",
        expectedStatus: 401
      },
      {
        name: "slow-request",
        description: "Wait for a bounded delay",
        endpoint: "GET /api/demo/slow?delayMs=1500",
        expectedStatus: 200
      }
    ]
  }));

  app.setErrorHandler((error, request, reply) => {
    request.log.error(
      { code: error instanceof DemoError ? error.code : "INTERNAL_ERROR" },
      "Demo request failed"
    );
    if (error instanceof DemoError)
      return reply
        .status(error.statusCode)
        .send({ error: { code: error.code, message: error.message } });
    return reply
      .status(500)
      .send({ error: { code: "INTERNAL_ERROR", message: "Demo request failed" } });
  });
  return app;
}

function getHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
