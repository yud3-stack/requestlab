import type { FastifyReply } from "fastify";
import { ZodError } from "zod";

export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "PAYLOAD_TOO_LARGE"
  | "DUPLICATE_EVENT"
  | "REPLAY_UNAVAILABLE"
  | "REPLAY_NOT_ALLOWED"
  | "REPLAY_NOT_FOUND"
  | "REPLAY_TARGET_INVALID"
  | "REPLAY_DUPLICATE_JOB"
  | "RATE_LIMITED"
  | "DEMO_UNAVAILABLE"
  | "DEMO_SCENARIO_NOT_FOUND"
  | "INTERNAL_ERROR";

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number,
    public readonly details: unknown = {}
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function validationError(message: string, details: unknown = {}): AppError {
  return new AppError("VALIDATION_ERROR", message, 400, details);
}

export function handleError(error: unknown, reply: FastifyReply): void {
  if (error instanceof AppError) {
    reply
      .status(error.statusCode)
      .send({ error: { code: error.code, message: error.message, details: error.details } });
    return;
  }
  if (error instanceof ZodError) {
    reply.status(400).send({
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: error.issues
      }
    });
    return;
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    error.statusCode === 400
  ) {
    reply
      .status(400)
      .send({ error: { code: "VALIDATION_ERROR", message: "Invalid request", details: {} } });
    return;
  }
  reply.status(500).send({
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred", details: {} }
  });
}
