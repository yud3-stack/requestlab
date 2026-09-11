import dotenv from "dotenv";
import { prisma } from "@requestlab/database";
import { cleanupHealthEvents, validateDemoProjectSlug } from "./demo-cleanup-health.js";

async function main(): Promise<void> {
  dotenv.config({ path: ".env" });
  const slug = validateDemoProjectSlug(process.env.DEMO_PROJECT_SLUG);
  const apply = process.argv.includes("--apply");
  const result = await cleanupHealthEvents(prisma, slug, { apply });
  if (!apply) console.log("Dry-run only: no records were deleted");
  else console.log(`Health cleanup complete: ${result.deletedEvents} event(s) deleted`);
}

void main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "";
    const safeMessages = new Set([
      "Demo project was not found",
      "DEMO_PROJECT_SLUG must identify one explicit project"
    ]);
    console.error(safeMessages.has(message) ? message : "Health cleanup failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
