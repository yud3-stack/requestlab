import type { PrismaClient } from "@requestlab/database";
import type { AppConfig } from "../config/index.js";

export type AppContext = {
  db: PrismaClient;
  config: AppConfig;
};
