import type { FastifyRequest } from "fastify";
import { AppError } from "./errors.js";
import { compareApiKey } from "./security.js";
import type { AppContext } from "../types/context.js";

export async function authenticateIngestionKey(
  request: FastifyRequest,
  context: AppContext
): Promise<string> {
  const headerValue = request.headers["x-requestlab-key"];
  const key = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (!key || !key.startsWith("rlk_")) {
    throw new AppError("UNAUTHORIZED", "A valid ingestion key is required", 401);
  }
  const candidateKeys = await context.db.apiKey.findMany({
    where: { keyPrefix: key.slice(0, 12) }
  });
  const matchingKey = candidateKeys.find((candidate) => compareApiKey(key, candidate.keyHash));
  if (
    !matchingKey ||
    matchingKey.revokedAt ||
    (matchingKey.expiresAt && matchingKey.expiresAt <= new Date())
  ) {
    throw new AppError("UNAUTHORIZED", "The ingestion key is invalid or expired", 401);
  }
  await context.db.apiKey.update({
    where: { id: matchingKey.id },
    data: { lastUsedAt: new Date() }
  });
  request.requestlabProjectId = matchingKey.projectId;
  return matchingKey.projectId;
}
