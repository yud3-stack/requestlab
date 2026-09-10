import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { prisma } from "@requestlab/database";
import type { ServiceHealth } from "@requestlab/shared";
import { loadConfig, type AppConfig } from "./config/index.js";
import { handleError } from "./lib/errors.js";
import { createReplayQueue } from "./lib/replay-queue.js";
import { registerApiKeyRoutes } from "./modules/api-keys/routes.js";
import { registerEnvironmentRoutes } from "./modules/environments/routes.js";
import { registerEventRoutes } from "./modules/events/routes.js";
import { registerProjectRoutes } from "./modules/projects/routes.js";
import { registerReplayRoutes } from "./modules/replays/routes.js";
import type { AppContext } from "./types/context.js";
import type { ReplayQueue } from "./lib/replay-queue.js";
import { startReplayWorker } from "@requestlab/worker";
import { registerDemoRoutes } from "./modules/demo/routes.js";
import { RateLimiter, clientKey } from "./lib/rate-limit.js";
import type { ReplayWorkerHandle } from "@requestlab/worker";

export type AppOptions = {
  db?: typeof prisma;
  config?: AppConfig;
  replayQueue?: ReplayQueue;
  replayWorker?: ReplayWorkerHandle;
};

export function createApp(options: AppOptions = {}): FastifyInstance {
  const config = options.config ?? loadConfig();
  const context: AppContext = {
    db: options.db ?? prisma,
    config,
    replayQueue: options.replayQueue ?? createReplayQueue(config.redisUrl)
  };
  const app = Fastify({
    logger: {
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.cookie",
          "req.headers.set-cookie",
          "req.headers.x-api-key",
          "req.headers.x-requestlab-api-key",
          "req.headers.x-requestlab-key",
          "req.headers.x-requestlab-demo-secret",
          "req.url"
        ],
        censor: "[REDACTED]"
      }
    },
    bodyLimit: 1024 * 1024,
    trustProxy: config.trustProxy
  });

  if (!options.replayWorker && config.runReplayWorker && config.redisUrl) {
    try {
      context.replayWorker = startReplayWorker({
        redisUrl: config.redisUrl,
        allowPrivate: config.allowPrivateReplayTargets === true,
        allowedHosts: config.replayAllowedHosts,
        timeoutMs: config.replayTimeoutMs ?? 10000,
        maxBytes: config.replayMaxResponseBytes ?? 128 * 1024,
        logger: (message) => app.log.error(message)
      });
    } catch {
      app.log.error("Replay worker could not start");
    }
  }
  if (options.replayWorker) context.replayWorker = options.replayWorker;

  const allowedOrigins = context.config.corsAllowedOrigins ?? [];
  const limits = context.config.rateLimits ?? {
    demoSession: 10,
    demoScenario: 20,
    replayCreate: 10,
    authenticated: 120
  };
  const authenticatedLimiter = new RateLimiter(limits.authenticated, 60_000);
  app.register(cors, {
    origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin)),
    allowedHeaders: [
      "Authorization",
      "Content-Type",
      "X-RequestLab-Key",
      "Idempotency-Key",
      ...(config.nodeEnv === "production" ? [] : ["X-RequestLab-User-Id"])
    ],
    methods: ["GET", "POST", "DELETE", "OPTIONS"]
  });

  app.addHook("onSend", async (request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (request.url.startsWith("/api/")) reply.header("Cache-Control", "no-store");
  });
  app.addHook("onRequest", async (request) => {
    if (request.url.startsWith("/api/") && request.method !== "OPTIONS")
      authenticatedLimiter.check(clientKey(request, "api"));
  });
  app.get<{ Reply: ServiceHealth & { worker?: string } }>("/health", async () => ({
    status: "ok",
    service: "api",
    worker: context.replayWorker ? "running" : "disabled"
  }));
  registerProjectRoutes(app, context);
  registerEnvironmentRoutes(app, context);
  registerApiKeyRoutes(app, context);
  registerEventRoutes(app, context);
  registerReplayRoutes(app, context);
  registerDemoRoutes(app, context);

  app.addHook("onClose", async () => {
    await context.replayWorker?.close();
    await context.replayQueue?.close();
  });

  app.setNotFoundHandler((_request, reply) => {
    reply
      .status(404)
      .send({ error: { code: "NOT_FOUND", message: "Route was not found", details: {} } });
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error(error);
    if (error instanceof Error && "statusCode" in error && error.statusCode === 413) {
      reply.status(413).send({
        error: { code: "PAYLOAD_TOO_LARGE", message: "Request payload is too large", details: {} }
      });
      return;
    }
    handleError(error, reply);
  });
  return app;
}
