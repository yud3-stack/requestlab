import type { FastifyRequest } from "fastify";
import type { ProjectMember, User } from "@prisma/client";
import { AppError } from "./errors.js";
import type { AppContext } from "../types/context.js";
import { requireDemoSession } from "./demo-session.js";

export async function requireUser(request: FastifyRequest, context: AppContext): Promise<User> {
  const demoClaims =
    context.config.nodeEnv === "production" && request.headers.authorization
      ? requireDemoSession(request, context)
      : undefined;
  const headerValue =
    context.config.nodeEnv === "production" ? undefined : request.headers["x-requestlab-user-id"];
  const headerUserId = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  const userId =
    demoClaims?.sub ??
    headerUserId ??
    (context.config.nodeEnv === "development" ? context.config.devUserId : undefined);
  if (!userId) {
    throw new AppError("UNAUTHORIZED", "A user identity is required", 401);
  }
  const user = await context.db.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new AppError("UNAUTHORIZED", "User was not found", 401);
  }
  return user;
}

export async function requireProjectMember(
  request: FastifyRequest,
  context: AppContext,
  projectId: string
): Promise<{ user: User; membership: ProjectMember }> {
  const demoClaims =
    context.config.nodeEnv === "production" && request.headers.authorization
      ? requireDemoSession(request, context)
      : undefined;
  if (demoClaims && demoClaims.projectId !== projectId)
    throw new AppError("FORBIDDEN", "Demo session cannot access this project", 403);
  const user = await requireUser(request, context);
  const membership = await context.db.projectMember.findUnique({
    where: { userId_projectId: { userId: user.id, projectId } }
  });
  if (!membership) {
    throw new AppError("FORBIDDEN", "You are not a member of this project", 403);
  }
  return { user, membership };
}

export function assertAdminRole(role: ProjectMember["role"]): void {
  if (role !== "OWNER" && role !== "ADMIN") {
    throw new AppError("FORBIDDEN", "This action requires an owner or admin role", 403);
  }
}
