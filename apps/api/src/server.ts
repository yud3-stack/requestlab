import dotenv from "dotenv";
import { createApp } from "./app.js";
import { loadConfig } from "./config/index.js";

dotenv.config({ path: new URL("../../../.env", import.meta.url) });

const config = loadConfig();
const app = createApp({ config });

try {
  await app.listen({ host: "0.0.0.0", port: config.apiPort });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
