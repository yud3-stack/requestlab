import dotenv from "dotenv";
import { startReplayWorker } from "./runtime.js";

dotenv.config({ path: new URL("../../../.env", import.meta.url) });

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  console.error("Replay worker cannot start: REDIS_URL is not configured.");
  process.exitCode = 1;
} else {
  const worker = startReplayWorker({
    redisUrl,
    allowPrivate:
      process.env.NODE_ENV === "development" && process.env.ALLOW_PRIVATE_REPLAY_TARGETS === "true",
    allowedHosts: process.env.REPLAY_ALLOWED_HOSTS?.split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
    timeoutMs: Number(process.env.REPLAY_TIMEOUT_MS ?? 10000),
    maxBytes: Number(process.env.REPLAY_MAX_RESPONSE_BYTES ?? 128 * 1024),
    logger: (message) => console.error(message)
  });
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    await worker.close();
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
  console.log("RequestLab replay worker is ready.");
}
