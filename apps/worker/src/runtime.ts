import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { prisma } from "@requestlab/database";
import { executeReplay } from "./replay.js";

export type ReplayWorkerHandle = {
  close(): Promise<void>;
  isRunning(): boolean;
};

export function startReplayWorker(options: {
  redisUrl: string;
  allowPrivate: boolean;
  allowedHosts?: string[];
  timeoutMs: number;
  maxBytes: number;
  logger?: (message: string) => void;
}): ReplayWorkerHandle {
  const connection = new Redis(options.redisUrl, { maxRetriesPerRequest: null });
  const worker = new Worker<{ replayId: string }>(
    "requestlab-replays",
    (job) =>
      executeReplay(prisma as never, job.data.replayId, {
        allowPrivate: options.allowPrivate,
        allowedHosts: options.allowedHosts,
        timeoutMs: options.timeoutMs,
        maxBytes: options.maxBytes
      }),
    { connection, concurrency: 4 }
  );
  worker.on("error", (error) => options.logger?.(`Replay worker error: ${error.message}`));
  let running = true;
  return {
    isRunning: () => running,
    async close() {
      if (!running) return;
      running = false;
      await worker.close();
      await connection.quit();
    }
  };
}
