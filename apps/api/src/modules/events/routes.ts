import type { FastifyInstance } from "fastify";
import type { Prisma } from "@prisma/client";
import { IngestEventInputSchema } from "@requestlab/shared";
import { authenticateIngestionKey } from "../../lib/api-key-auth.js";
import { requireProjectMember } from "../../lib/auth.js";
import { AppError, validationError } from "../../lib/errors.js";
import {
  assertPayloadSize,
  maskSensitiveData,
  MAX_HEADERS_BYTES,
  MAX_JSON_BYTES
} from "../../lib/masking.js";
import type { AppContext } from "../../types/context.js";

export function registerEventRoutes(app: FastifyInstance, context: AppContext): void {
  app.post("/api/v1/events", async (request, reply) => {
    const projectId = await authenticateIngestionKey(request, context);
    const parsed = IngestEventInputSchema.safeParse(request.body);
    if (!parsed.success) throw validationError("Invalid event input", parsed.error.issues);
    const input = parsed.data;
    const environment = await context.db.environment.findUnique({
      where: { projectId_slug: { projectId, slug: input.environment } }
    });
    if (!environment)
      throw new AppError(
        "VALIDATION_ERROR",
        "Environment does not belong to the API key project",
        400
      );
    const requestHeaders = maskSensitiveData(input.requestHeaders);
    const responseHeaders = maskSensitiveData(input.responseHeaders);
    const requestBody = maskSensitiveData(input.requestBody);
    const responseBody = maskSensitiveData(input.responseBody);
    try {
      assertPayloadSize(requestHeaders, MAX_HEADERS_BYTES, "Request headers");
      assertPayloadSize(responseHeaders, MAX_HEADERS_BYTES, "Response headers");
      assertPayloadSize(requestBody, MAX_JSON_BYTES, "Request body");
      assertPayloadSize(responseBody, MAX_JSON_BYTES, "Response body");
    } catch {
      throw new AppError(
        "PAYLOAD_TOO_LARGE",
        "Event headers or body exceeds the allowed size",
        413
      );
    }
    try {
      const event = await context.db.requestEvent.create({
        data: {
          externalEventId: input.externalEventId,
          projectId,
          environmentId: environment.id,
          requestId: input.requestId ?? null,
          method: input.method.toUpperCase(),
          path: input.path,
          route: input.route ?? null,
          query: toJson(input.query),
          requestHeaders: toJson(requestHeaders),
          requestBody: toJson(requestBody),
          responseHeaders: toJson(responseHeaders),
          responseBody: toJson(responseBody),
          statusCode: input.statusCode,
          durationMs: input.durationMs ?? null,
          errorType: input.errorType ?? null,
          errorMessage: input.errorMessage ?? null,
          stackTrace: input.stackTrace ?? null,
          occurredAt: input.occurredAt
        }
      });
      return reply.status(201).send({ data: toDetail(event) });
    } catch (error) {
      if (isUniqueConstraint(error))
        throw new AppError("DUPLICATE_EVENT", "This external event was already ingested", 409);
      throw error;
    }
  });

  app.get<{ Params: { projectId: string }; Querystring: Record<string, string | undefined> }>(
    "/api/projects/:projectId/events",
    async (request) => {
      const { projectId } = request.params;
      await requireProjectMember(request, context, projectId);
      const query = parseListQuery(request.query);
      const where: Prisma.RequestEventWhereInput = { projectId };
      if (query.search)
        where.OR = [
          { path: { contains: query.search, mode: "insensitive" } },
          { requestId: { contains: query.search, mode: "insensitive" } },
          { errorMessage: { contains: query.search, mode: "insensitive" } }
        ];
      if (query.method) where.method = query.method.toUpperCase();
      if (query.statusCode) where.statusCode = query.statusCode;
      if (query.environmentId) where.environmentId = query.environmentId;
      if (query.from || query.to) where.occurredAt = { gte: query.from, lte: query.to };
      const [total, events] = await Promise.all([
        context.db.requestEvent.count({ where }),
        context.db.requestEvent.findMany({
          where,
          orderBy: { occurredAt: query.sortOrder },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize
        })
      ]);
      return {
        data: events.map(toSummary),
        pagination: {
          page: query.page,
          pageSize: query.pageSize,
          total,
          totalPages: Math.ceil(total / query.pageSize)
        }
      };
    }
  );

  app.get<{ Params: { projectId: string; eventId: string } }>(
    "/api/projects/:projectId/events/:eventId",
    async (request) => {
      const { projectId, eventId } = request.params;
      await requireProjectMember(request, context, projectId);
      const event = await context.db.requestEvent.findFirst({ where: { id: eventId, projectId } });
      if (!event) throw new AppError("NOT_FOUND", "Event was not found", 404);
      return { data: toDetail(event) };
    }
  );
}

function parseListQuery(query: Record<string, string | undefined>) {
  const page = parsePositiveInt(query.page, 1);
  const pageSize = Math.min(parsePositiveInt(query.pageSize, 20), 100);
  const statusCode = query.statusCode ? Number(query.statusCode) : undefined;
  if (
    statusCode !== undefined &&
    (!Number.isInteger(statusCode) || statusCode < 100 || statusCode > 599)
  )
    throw validationError("Invalid statusCode");
  const from = parseDate(query.from);
  const to = parseDate(query.to);
  if (query.from && !from) throw validationError("Invalid from date");
  if (query.to && !to) throw validationError("Invalid to date");
  return {
    page,
    pageSize,
    search: query.search?.trim(),
    method: query.method,
    statusCode,
    environmentId: query.environmentId,
    from,
    to,
    sortOrder: query.sortOrder === "asc" ? ("asc" as const) : ("desc" as const)
  };
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1)
    throw validationError("Pagination values must be positive integers");
  return parsed;
}

function parseDate(value: string | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined ? undefined : (value as Prisma.InputJsonValue);
}

function toSummary(event: EventRecord) {
  return {
    id: event.id,
    externalEventId: event.externalEventId,
    environmentId: event.environmentId,
    requestId: event.requestId,
    method: event.method,
    path: event.path,
    route: event.route,
    statusCode: event.statusCode,
    durationMs: event.durationMs,
    errorType: event.errorType,
    errorMessage: event.errorMessage,
    occurredAt: event.occurredAt.toISOString(),
    createdAt: event.createdAt.toISOString()
  };
}

function toDetail(event: EventRecord) {
  return {
    ...toSummary(event),
    query: event.query,
    requestHeaders: event.requestHeaders,
    requestBody: event.requestBody,
    responseHeaders: event.responseHeaders,
    responseBody: event.responseBody,
    stackTrace: event.stackTrace
  };
}

type EventRecord = {
  id: string;
  externalEventId: string;
  environmentId: string;
  requestId: string | null;
  method: string;
  path: string;
  route: string | null;
  query: unknown;
  requestHeaders: unknown;
  requestBody: unknown;
  responseHeaders: unknown;
  responseBody: unknown;
  statusCode: number;
  durationMs: number | null;
  errorType: string | null;
  errorMessage: string | null;
  stackTrace: string | null;
  occurredAt: Date;
  createdAt: Date;
};

function isUniqueConstraint(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
