import dotenv from "dotenv";
import type { FastifyInstance } from "fastify";
import { createDemoApp } from "./app.js";

export async function main(): Promise<void> {
  let app: FastifyInstance | undefined;
  try {
    dotenv.config({ path: new URL("../../../.env", import.meta.url) });

    const apiUrl = process.env.REQUESTLAB_API_URL;
    const apiKey = process.env.REQUESTLAB_API_KEY;
    const environment = process.env.REQUESTLAB_ENVIRONMENT ?? "development";
    const captureMode = process.env.REQUESTLAB_CAPTURE_MODE === "all" ? "all" : "errors";
    const corsAllowedOrigins =
      process.env.NODE_ENV === "production"
        ? (process.env.CORS_ALLOWED_ORIGINS || "")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
        : ["http://localhost:5173", "http://127.0.0.1:5173"];
    app = createDemoApp(
      apiUrl && apiKey
        ? {
            requestLab: {
              apiUrl,
              apiKey,
              environment,
              captureMode,
              ignorePaths: [
                "/health",
                "/internal/demo/scenarios/order-error",
                "/internal/demo/scenarios/login-error",
                "/internal/demo/scenarios/slow-request"
              ],
              includePaths: [
                "/api/products",
                "/api/orders",
                "/api/orders/order-1",
                "/api/auth/login",
                "/api/demo/slow"
              ]
            },
            nodeEnv: process.env.NODE_ENV,
            triggerSecret: process.env.DEMO_TRIGGER_SECRET,
            corsAllowedOrigins
          }
        : {
            logger: true,
            nodeEnv: process.env.NODE_ENV,
            triggerSecret: process.env.DEMO_TRIGGER_SECRET,
            corsAllowedOrigins
          }
    );

    if (!apiUrl || !apiKey)
      app.log.warn(
        "RequestLab SDK disabled: REQUESTLAB_API_URL and REQUESTLAB_API_KEY are not configured"
      );

    let shuttingDown = false;
    const shutdown = async (signal: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      app?.log.info({ signal }, "Demo API shutting down");
      await app?.close();
    };
    process.once("SIGINT", () => void shutdown("SIGINT"));
    process.once("SIGTERM", () => void shutdown("SIGTERM"));

    await app!.listen({
      host: "0.0.0.0",
      port: Number(process.env.PORT ?? process.env.DEMO_API_PORT ?? 3002)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown startup error";
    if (app) app.log.error({ error: message }, "Demo API failed to start");
    else console.error(`Demo API failed to start: ${message}`);
    await app?.close().catch(() => undefined);
    process.exitCode = 1;
  }
}

void main();
