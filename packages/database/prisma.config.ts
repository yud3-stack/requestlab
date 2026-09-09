import dotenv from "dotenv";
import { defineConfig, env } from "prisma/config";

dotenv.config({ path: new URL("../../.env", import.meta.url) });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations"
  },
  datasource: {
    url: env("DIRECT_URL")
  }
});
