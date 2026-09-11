import type { PrismaClient } from "@requestlab/database";

const HEALTH_PATH = "/health";

export type HealthCleanupDatabase = Pick<
  PrismaClient,
  "project" | "requestEvent" | "replayRun" | "$transaction"
>;

export type HealthCleanupResult = {
  dryRun: boolean;
  targetEvents: number;
  relatedReplayRuns: number;
  deletedEvents: number;
  deletedReplayRuns: number;
};

export async function cleanupHealthEvents(
  database: HealthCleanupDatabase,
  slug: string,
  options: { apply: boolean; log?: (message: string) => void }
): Promise<HealthCleanupResult> {
  const log = options.log ?? console.log;
  const project = await database.project.findUnique({ where: { slug }, select: { id: true } });
  if (!project) throw new Error("Demo project was not found");

  return await database.$transaction(async (transaction) => {
    const events = await transaction.requestEvent.findMany({
      where: { projectId: project.id, path: HEALTH_PATH },
      select: { id: true }
    });
    const eventIds = events.map((event) => event.id);
    const relatedReplayRuns = eventIds.length
      ? await transaction.replayRun.count({
          where: { projectId: project.id, originalEventId: { in: eventIds } }
        })
      : 0;
    log(
      `${options.apply ? "Health cleanup apply" : "Health cleanup dry-run"}: ${eventIds.length} target event(s), ${relatedReplayRuns} related replay(s)`
    );

    if (!options.apply)
      return {
        dryRun: true,
        targetEvents: eventIds.length,
        relatedReplayRuns,
        deletedEvents: 0,
        deletedReplayRuns: 0
      };

    const deletedReplayRuns = eventIds.length
      ? (
          await transaction.replayRun.deleteMany({
            where: { projectId: project.id, originalEventId: { in: eventIds } }
          })
        ).count
      : 0;
    const deletedEvents = eventIds.length
      ? (
          await transaction.requestEvent.deleteMany({
            where: { id: { in: eventIds }, projectId: project.id, path: HEALTH_PATH }
          })
        ).count
      : 0;
    log(`Health cleanup deleted ${deletedEvents} event(s) and ${deletedReplayRuns} replay(s)`);
    return {
      dryRun: false,
      targetEvents: eventIds.length,
      relatedReplayRuns,
      deletedEvents,
      deletedReplayRuns
    };
  });
}

export function validateDemoProjectSlug(value: string | undefined): string {
  const slug = value?.trim();
  if (!slug || slug === "*" || slug.includes("/") || slug.length < 2)
    throw new Error("DEMO_PROJECT_SLUG must identify one explicit project");
  return slug;
}
