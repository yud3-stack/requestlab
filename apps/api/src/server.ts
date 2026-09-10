import dotenv from "dotenv";
import { createApp } from "./app.js";
import { loadConfig } from "./config/index.js";

dotenv.config({ path: new URL("../../../.env", import.meta.url) });

const config = loadConfig();
const app = createApp({ config });

let shuttingDown = false;
const shutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, "API shutting down");
  await app.close();
  await import("@requestlab/database").then(({ prisma }) => prisma.$disconnect());
};
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await app.listen({ host: "0.0.0.0", port: config.apiPort });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
