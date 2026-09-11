import type { HealthCleanupDatabase } from "./demo-cleanup-health.js";

const SCANNER_ENV_SEGMENT = /^\.env(?:[.-][a-z0-9][a-z0-9_-]*)*$/;

export type ScannerCleanupResult = {
  dryRun: boolean;
  targetEvents: number;
  relatedReplayRuns: number;
  deletedEvents: number;
  deletedReplayRuns: number;
};

export function isEnvScannerPath(path: string): boolean {
  const pathWithoutQuery = path.split("?", 1)[0] ?? path;
  return pathWithoutQuery.split("/").some((segment) => SCANNER_ENV_SEGMENT.test(segment));
}

export async function cleanupScannerEvents(
  database: HealthCleanupDatabase,
  slug: string,
  options: { apply: boolean; log?: (message: string) => void }
): Promise<ScannerCleanupResult> {
  const log = options.log ?? console.log;
  const project = await database.project.findUnique({ where: { slug }, select: { id: true } });
  if (!project) throw new Error("Demo project was not found");

  return await database.$transaction(async (transaction) => {
    const candidates = await transaction.requestEvent.findMany({
      where: { projectId: project.id, method: "GET", statusCode: 404 },
      select: { id: true, path: true }
    });
    const eventIds = candidates
      .filter((event) => isEnvScannerPath(event.path))
      .map((event) => event.id);
    const relatedReplayRuns = eventIds.length
      ? await transaction.replayRun.count({
          where: { projectId: project.id, originalEventId: { in: eventIds } }
        })
      : 0;
    log(
      `${options.apply ? "Scanner cleanup apply" : "Scanner cleanup dry-run"}: ${eventIds.length} target event(s), ${relatedReplayRuns} related replay(s)`
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
            where: {
              id: { in: eventIds },
              projectId: project.id,
              method: "GET",
              statusCode: 404
            }
          })
        ).count
      : 0;
    log(`Scanner cleanup deleted ${deletedEvents} event(s) and ${deletedReplayRuns} replay(s)`);
    return {
      dryRun: false,
      targetEvents: eventIds.length,
      relatedReplayRuns,
      deletedEvents,
      deletedReplayRuns
    };
  });
}
