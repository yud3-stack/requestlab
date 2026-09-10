import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { CreateReplayInputSchema } from "@requestlab/shared";
import { requireProjectMember } from "../../lib/auth.js";
import { AppError, validationError } from "../../lib/errors.js";
import { maskSensitiveData } from "../../lib/masking.js";
import { buildReplayTarget } from "../../lib/replay-target.js";
import type { AppContext } from "../../types/context.js";
import { RateLimiter, clientKey } from "../../lib/rate-limit.js";

const writableMethods = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const blockedHeaders = new Set([
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "host",
  "content-length",
  "connection",
  "transfer-encoding",
  "forwarded",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-real-ip",
  "x-requestlab-demo-secret",
  "x-requestlab-api-key",
  "x-api-key"
]);

export function registerReplayRoutes(app: FastifyInstance, context: AppContext): void {
  const limits = context.config.rateLimits ?? {
    demoSession: 10,
    demoScenario: 20,
    replayCreate: 10,
    authenticated: 120
  };
  const replayLimiter = new RateLimiter(limits.replayCreate, 10 * 60_000);
  app.post<{ Params: { projectId: string; eventId: string } }>(
    "/api/projects/:projectId/events/:eventId/replays",
    async (request, reply) => {
      const { projectId, eventId } = request.params;
      replayLimiter.check(clientKey(request, `replay:${projectId}`));
      const { user, membership } = await requireProjectMember(request, context, projectId);
      if (membership.role === "VIEWER")
        throw new AppError("REPLAY_NOT_ALLOWED", "Viewer users cannot create replays", 403);
      const parsed = CreateReplayInputSchema.safeParse(request.body);
      if (!parsed.success) throw validationError("Invalid replay input", parsed.error.issues);
      if (!context.replayQueue)
        throw new AppError("REPLAY_UNAVAILABLE", "Replay worker is unavailable", 503);
      const event = await context.db.requestEvent.findFirst({ where: { id: eventId, projectId } });
      if (!event) throw new AppError("REPLAY_NOT_FOUND", "Event was not found", 404);
      if (event.statusCode < 400)
        throw new AppError("REPLAY_NOT_ALLOWED", "Only failed events can be replayed", 400);
      const environment = await context.db.environment.findUnique({
        where: { id: parsed.data.environmentId }
      });
      if (!environment || environment.projectId !== projectId)
        throw new AppError(
          "REPLAY_NOT_ALLOWED",
          "Environment does not belong to this project",
          400
        );
      const method = event.method.toUpperCase();
      if (writableMethods.has(method) && parsed.data.confirmSideEffects !== true)
        throw new AppError(
          "REPLAY_NOT_ALLOWED",
          "Side-effecting replays require confirmation",
          400
        );
      const targetUrl = buildReplayTarget(
        environment.baseUrl,
        event.path,
        environment.type === "PRODUCTION" || !environment.replayEnabled,
        context.config.allowPrivateReplayTargets === true,
        context.config.replayAllowedHosts
      );
      const requestHeaders = safeHeaders(parsed.data.headers ?? event.requestHeaders);
      if (writableMethods.has(method))
        requestHeaders["Idempotency-Key"] = `requestlab-replay-${Date.now()}`;
      const replay = await context.db.replayRun.create({
        data: {
          projectId,
          originalEventId: event.id,
          environmentId: environment.id,
          requestedBy: user.id,
          method,
          targetUrl,
          requestHeaders,
          requestQuery: toJson(parsed.data.query ?? event.query),
          requestBody: toJson(parsed.data.body ?? event.requestBody)
        }
      });
      await context.db.auditEvent.create({
        data: {
          projectId,
          userId: user.id,
          action: "REPLAY_CREATED",
          resourceType: "ReplayRun",
          resourceId: replay.id,
          metadata: { environmentId: environment.id, method }
        }
      });
      try {
        await context.replayQueue.add(replay.id);
      } catch (error) {
        await context.db.replayRun.update({
          where: { id: replay.id },
          data: { status: "FAILED", errorMessage: "Replay could not be queued" }
        });
        if (error instanceof Error && error.message === "REPLAY_DUPLICATE_JOB")
          throw new AppError("REPLAY_DUPLICATE_JOB", "Replay job already exists", 409);
        throw new AppError("REPLAY_UNAVAILABLE", "Replay worker is unavailable", 503);
      }
      return reply.status(202).send({ data: toSummary(replay) });
    }
  );

  app.get<{ Params: { projectId: string }; Querystring: Record<string, string | undefined> }>(
    "/api/projects/:projectId/replays",
    async (request) => {
      const { projectId } = request.params;
      await requireProjectMember(request, context, projectId);
      const page = positive(request.query.page, 1);
      const pageSize = Math.min(positive(request.query.pageSize, 20), 100);
      const where: Prisma.ReplayRunWhereInput = { projectId };
      if (request.query.status) where.status = request.query.status as never;
      if (request.query.environmentId) where.environmentId = request.query.environmentId;
      if (request.query.from || request.query.to)
        where.createdAt = { gte: date(request.query.from), lte: date(request.query.to) };
      const [total, rows] = await Promise.all([
        context.db.replayRun.count({ where }),
        context.db.replayRun.findMany({
          where,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize
        })
      ]);
      return {
        data: rows.map(toSummary),
        pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
      };
    }
  );

  app.get<{ Params: { projectId: string; replayId: string } }>(
    "/api/projects/:projectId/replays/:replayId",
    async (request) => {
      await requireProjectMember(request, context, request.params.projectId);
      const replay = await context.db.replayRun.findFirst({
        where: { id: request.params.replayId, projectId: request.params.projectId }
      });
      if (!replay) throw new AppError("REPLAY_NOT_FOUND", "Replay was not found", 404);
      return {
        data: {
          ...toSummary(replay),
          projectId: replay.projectId,
          requestHeaders: replay.requestHeaders,
          requestQuery: replay.requestQuery,
          requestBody: replay.requestBody,
          responseHeaders: replay.responseHeaders,
          responseBody: replay.responseBody
        }
      };
    }
  );
}

function safeHeaders(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const output: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (blockedHeaders.has(key.toLowerCase()) || raw === "[REDACTED]" || typeof raw !== "string")
      continue;
    output[key] = raw;
  }
  return maskSensitiveData(output) as Record<string, string>;
}
function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined ? undefined : (maskSensitiveData(value) as Prisma.InputJsonValue);
}
function positive(value: string | undefined, fallback: number): number {
  const n = Number(value ?? fallback);
  if (!Number.isInteger(n) || n < 1)
    throw validationError("Pagination values must be positive integers");
  return n;
}
function date(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const result = new Date(value);
  if (Number.isNaN(result.getTime())) throw validationError("Invalid replay date");
  return result;
}
type ReplayRow = {
  id: string;
  originalEventId: string;
  environmentId: string;
  requestedBy: string;
  status: string;
  method: string;
  targetUrl: string;
  statusCode: number | null;
  durationMs: number | null;
  errorMessage: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
};
function toSummary(replay: ReplayRow) {
  return {
    id: replay.id,
    originalEventId: replay.originalEventId,
    environmentId: replay.environmentId,
    requestedBy: replay.requestedBy,
    status: replay.status,
    method: replay.method,
    targetUrl: replay.targetUrl,
    statusCode: replay.statusCode,
    durationMs: replay.durationMs,
    errorMessage: replay.errorMessage,
    startedAt: replay.startedAt?.toISOString() ?? null,
    finishedAt: replay.finishedAt?.toISOString() ?? null,
    createdAt: replay.createdAt.toISOString()
  };
}
