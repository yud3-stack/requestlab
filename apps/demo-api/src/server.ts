import dotenv from "dotenv";
import { createDemoApp } from "./app.js";

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
const app = createDemoApp(
  apiUrl && apiKey
    ? {
        requestLab: { apiUrl, apiKey, environment, captureMode },
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

try {
  await app.listen({ host: "0.0.0.0", port: Number(process.env.DEMO_API_PORT ?? 3002) });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
