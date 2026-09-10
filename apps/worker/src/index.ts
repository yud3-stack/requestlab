import dotenv from "dotenv";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { prisma } from "@requestlab/database";
import { executeReplay } from "./replay.js";

dotenv.config({ path: new URL("../../../.env", import.meta.url) });

const redisUrl = process.env.REDIS_URL;
if (!redisUrl) {
  console.error("Replay worker cannot start: REDIS_URL is not configured.");
  process.exitCode = 1;
} else {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const worker = new Worker<{ replayId: string }>(
    "requestlab-replays",
    (job) =>
      executeReplay(prisma as never, job.data.replayId, {
        allowPrivate:
          process.env.NODE_ENV === "development" &&
          process.env.ALLOW_PRIVATE_REPLAY_TARGETS === "true",
        timeoutMs: Number(process.env.REPLAY_TIMEOUT_MS ?? 10000),
        maxBytes: Number(process.env.REPLAY_MAX_RESPONSE_BYTES ?? 128 * 1024)
      }),
    { connection, concurrency: 4 }
  );
  worker.on("error", (error) => console.error("Replay worker error:", error.message));
  const shutdown = async () => {
    await worker.close();
    await connection.quit();
    await prisma.$disconnect();
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
  console.log("RequestLab replay worker is ready.");
}
