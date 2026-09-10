import type { FastifyInstance } from "fastify";
import { CreateEnvironmentInputSchema } from "@requestlab/shared";
import { assertAdminRole, requireProjectMember } from "../../lib/auth.js";
import { AppError, validationError } from "../../lib/errors.js";
import type { AppContext } from "../../types/context.js";

export function registerEnvironmentRoutes(app: FastifyInstance, context: AppContext): void {
  app.get<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/environments",
    async (request) => {
      const { projectId } = request.params;
      await requireProjectMember(request, context, projectId);
      const environments = await context.db.environment.findMany({
        where: { projectId },
        orderBy: { createdAt: "asc" }
      });
      return { data: environments.map(toEnvironment) };
    }
  );

  app.post<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/environments",
    async (request, reply) => {
      if (context.config.nodeEnv === "production" && request.headers.authorization)
        throw new AppError("FORBIDDEN", "Demo sessions cannot change environments", 403);
      const { projectId } = request.params;
      const { membership } = await requireProjectMember(request, context, projectId);
      assertAdminRole(membership.role);
      const input = CreateEnvironmentInputSchema.safeParse(request.body);
      if (!input.success) throw validationError("Invalid environment input", input.error.issues);
      const replayEnabled = input.data.replayEnabled ?? input.data.type !== "PRODUCTION";
      try {
        const environment = await context.db.environment.create({
          data: { ...input.data, projectId, replayEnabled }
        });
        return reply.status(201).send({ data: toEnvironment(environment) });
      } catch (error) {
        if (isUniqueConstraint(error))
          throw validationError("Environment slug is already in use for this project");
        throw error;
      }
    }
  );
}

function toEnvironment(environment: {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  type: string;
  baseUrl: string | null;
  replayEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: environment.id,
    projectId: environment.projectId,
    name: environment.name,
    slug: environment.slug,
    type: environment.type,
    baseUrl: environment.baseUrl,
    replayEnabled: environment.replayEnabled,
    createdAt: environment.createdAt.toISOString(),
    updatedAt: environment.updatedAt.toISOString()
  };
}

function isUniqueConstraint(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
