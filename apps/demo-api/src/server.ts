import dotenv from "dotenv";
import { createDemoApp } from "./app.js";

dotenv.config({ path: new URL("../../../.env", import.meta.url) });

const apiUrl = process.env.REQUESTLAB_API_URL;
const apiKey = process.env.REQUESTLAB_API_KEY;
const environment = process.env.REQUESTLAB_ENVIRONMENT ?? "development";
const captureMode = process.env.REQUESTLAB_CAPTURE_MODE === "all" ? "all" : "errors";
const app = createDemoApp(
  apiUrl && apiKey ? { requestLab: { apiUrl, apiKey, environment, captureMode } } : { logger: true }
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
