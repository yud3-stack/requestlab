import { z } from "zod";

export type ServiceHealth = {
  status: "ok" | "error";
  service: string;
};

export const ServiceHealthSchema = z.object({
  status: z.enum(["ok", "error"]),
  service: z.string()
});

export const CreateProjectInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(100)
});
export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;

export const CreateEnvironmentInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(100),
  type: z.enum(["DEVELOPMENT", "TEST", "STAGING", "PRODUCTION"]),
  baseUrl: z.string().url().max(2048).nullable().optional(),
  replayEnabled: z.boolean().optional()
});
export type CreateEnvironmentInput = z.infer<typeof CreateEnvironmentInputSchema>;

export const CreateApiKeyInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  expiresAt: z.coerce.date().nullable().optional()
});
export type CreateApiKeyInput = z.infer<typeof CreateApiKeyInputSchema>;

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema)
  ])
);

export const IngestEventInputSchema = z.object({
  externalEventId: z.string().trim().min(1).max(200),
  environment: z.string().trim().min(1).max(100),
  requestId: z.string().max(200).nullable().optional(),
  method: z
    .string()
    .trim()
    .regex(/^[A-Za-z]+$/)
    .max(16),
  path: z.string().min(1).max(2048),
  route: z.string().max(2048).nullable().optional(),
  query: jsonValueSchema.optional(),
  requestHeaders: z.record(z.string(), jsonValueSchema).optional(),
  requestBody: jsonValueSchema.optional(),
  responseHeaders: z.record(z.string(), jsonValueSchema).optional(),
  responseBody: jsonValueSchema.optional(),
  statusCode: z.number().int().min(100).max(599),
  durationMs: z.number().int().min(0).max(86_400_000).nullable().optional(),
  errorType: z.string().max(200).nullable().optional(),
  errorMessage: z.string().max(10_000).nullable().optional(),
  stackTrace: z.string().max(50_000).nullable().optional(),
  occurredAt: z.coerce.date()
});
export type IngestEventInput = z.infer<typeof IngestEventInputSchema>;

export type RequestEventSummary = {
  id: string;
  externalEventId: string;
  environmentId: string;
  requestId: string | null;
  method: string;
  path: string;
  route: string | null;
  statusCode: number;
  durationMs: number | null;
  errorType: string | null;
  errorMessage: string | null;
  occurredAt: string;
  createdAt: string;
};

export type RequestEventDetail = RequestEventSummary & {
  query: unknown;
  requestHeaders: unknown;
  requestBody: unknown;
  responseHeaders: unknown;
  responseBody: unknown;
  stackTrace: string | null;
};

export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type ApiErrorResponse = {
  error: {
    code:
      | "UNAUTHORIZED"
      | "FORBIDDEN"
      | "NOT_FOUND"
      | "VALIDATION_ERROR"
      | "PAYLOAD_TOO_LARGE"
      | "DUPLICATE_EVENT"
      | "INTERNAL_ERROR";
    message: string;
    details: unknown;
  };
};

export type PaginatedResponse<T> = {
  data: T[];
  pagination: Pagination;
};
