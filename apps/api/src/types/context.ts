import type { PrismaClient } from "@requestlab/database";
import type { AppConfig } from "../config/index.js";
import type { ReplayQueue } from "../lib/replay-queue.js";

export type AppContext = {
  db: PrismaClient;
  config: AppConfig;
  replayQueue?: ReplayQueue;
};
