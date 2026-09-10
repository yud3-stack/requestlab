import type { PrismaClient } from "@requestlab/database";
import type { AppConfig } from "../config/index.js";
import type { ReplayQueue } from "../lib/replay-queue.js";
import type { ReplayWorkerHandle } from "@requestlab/worker";

export type AppContext = {
  db: PrismaClient;
  config: AppConfig;
  replayQueue?: ReplayQueue;
  replayWorker?: ReplayWorkerHandle;
};
