import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { prisma } from "@requestlab/database";
import type { ServiceHealth } from "@requestlab/shared";
import { loadConfig, type AppConfig } from "./config/index.js";
import { handleError } from "./lib/errors.js";
import { registerApiKeyRoutes } from "./modules/api-keys/routes.js";
import { registerEnvironmentRoutes } from "./modules/environments/routes.js";
import { registerEventRoutes } from "./modules/events/routes.js";
import { registerProjectRoutes } from "./modules/projects/routes.js";
import type { AppContext } from "./types/context.js";

export type AppOptions = {
  db?: typeof prisma;
  config?: AppConfig;
};

export function createApp(options: AppOptions = {}): FastifyInstance {
  const context: AppContext = { db: options.db ?? prisma, config: options.config ?? loadConfig() };
  const app = Fastify({ logger: true, bodyLimit: 1024 * 1024 });

  const allowedOrigins = context.config.corsAllowedOrigins ?? [];
  app.register(cors, {
    origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin)),
    allowedHeaders: ["Content-Type", "X-RequestLab-User-Id", "X-RequestLab-Key"],
    methods: ["GET", "POST", "DELETE", "OPTIONS"]
  });

  app.get<{ Reply: ServiceHealth }>("/health", async () => ({ status: "ok", service: "api" }));
  registerProjectRoutes(app, context);
  registerEnvironmentRoutes(app, context);
  registerApiKeyRoutes(app, context);
  registerEventRoutes(app, context);

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
