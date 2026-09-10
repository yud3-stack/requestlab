import dotenv from "dotenv";
import { prisma } from "@requestlab/database";

dotenv.config({ path: new URL("../.env", import.meta.url) });

const slug = process.env.DEMO_PROJECT_SLUG?.trim();
const dryRun = process.argv.includes("--dry-run");
const retentionArgument = process.argv
  .find((value) => value.startsWith("--retention-hours="))
  ?.split("=")[1];
const retentionHours = Number(retentionArgument ?? process.env.DEMO_CLEANUP_RETENTION_HOURS ?? 24);

async function main(): Promise<void> {
  if (!slug || slug === "*" || slug.includes("/") || slug.length < 2)
    throw new Error("DEMO_PROJECT_SLUG must identify one explicit project");
  if (!Number.isFinite(retentionHours) || retentionHours < 1 || retentionHours > 24 * 365)
    throw new Error("Retention hours must be between 1 and 8760");
  if (process.env.NODE_ENV === "production" && process.env.DEMO_CLEANUP_CONFIRM !== "YES")
    throw new Error("Production cleanup requires DEMO_CLEANUP_CONFIRM=YES");
  if (
    process.env.NODE_ENV !== "production" &&
    process.env.DEMO_CLEANUP_ALLOW_NON_PRODUCTION !== "true"
  )
    throw new Error("Non-production cleanup requires DEMO_CLEANUP_ALLOW_NON_PRODUCTION=true");

  const project = await prisma.project.findUnique({ where: { slug } });
  if (!project) throw new Error("Demo project was not found");
  const before = new Date(Date.now() - retentionHours * 60 * 60 * 1000);
  const counts = await prisma.$transaction(async (transaction) => {
    const replays = await transaction.replayRun.count({
      where: { projectId: project.id, createdAt: { lt: before } }
    });
    const events = await transaction.requestEvent.count({
      where: { projectId: project.id, createdAt: { lt: before } }
    });
    const audits = await transaction.auditEvent.count({
      where: { projectId: project.id, createdAt: { lt: before } }
    });
    if (!dryRun) {
      await transaction.replayRun.deleteMany({
        where: { projectId: project.id, createdAt: { lt: before } }
      });
      await transaction.requestEvent.deleteMany({
        where: { projectId: project.id, createdAt: { lt: before } }
      });
      await transaction.auditEvent.deleteMany({
        where: { projectId: project.id, createdAt: { lt: before } }
      });
    }
    return { replayRuns: replays, events, auditEvents: audits };
  });
  console.log(JSON.stringify({ dryRun, ...counts }));
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Demo cleanup failed");
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
