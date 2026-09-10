import { Queue } from "bullmq";
import { Redis } from "ioredis";

export type ReplayJob = { replayId: string };
export type ReplayQueue = {
  add(replayId: string): Promise<void>;
  close(): Promise<void>;
};

export function createReplayQueue(redisUrl: string | undefined): ReplayQueue | undefined {
  if (!redisUrl) return undefined;
  let connection: Redis;
  let queue: Queue<ReplayJob>;
  try {
    connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
    queue = new Queue<ReplayJob>("requestlab-replays", { connection });
  } catch {
    return undefined;
  }
  return {
    async add(replayId) {
      if (await queue.getJob(replayId)) throw new Error("REPLAY_DUPLICATE_JOB");
      await queue.add(
        "replay",
        { replayId },
        { jobId: replayId, removeOnComplete: 100, removeOnFail: 100 }
      );
    },
    async close() {
      await queue.close();
      await connection.quit();
    }
  };
}
