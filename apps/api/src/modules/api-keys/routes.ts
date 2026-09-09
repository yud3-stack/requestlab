import type { FastifyInstance } from "fastify";
import { CreateApiKeyInputSchema } from "@requestlab/shared";
import { assertAdminRole, requireProjectMember } from "../../lib/auth.js";
import { AppError, validationError } from "../../lib/errors.js";
import { createApiKey } from "../../lib/security.js";
import type { AppContext } from "../../types/context.js";

export function registerApiKeyRoutes(app: FastifyInstance, context: AppContext): void {
  app.get<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/api-keys",
    async (request) => {
      const { projectId } = request.params;
      await requireProjectMember(request, context, projectId);
      const keys = await context.db.apiKey.findMany({
        where: { projectId },
        orderBy: { createdAt: "desc" }
      });
      return { data: keys.map(toApiKey) };
    }
  );

  app.post<{ Params: { projectId: string } }>(
    "/api/projects/:projectId/api-keys",
    async (request, reply) => {
      const { projectId } = request.params;
      const { user, membership } = await requireProjectMember(request, context, projectId);
      assertAdminRole(membership.role);
      const input = CreateApiKeyInputSchema.safeParse(request.body);
      if (!input.success) throw validationError("Invalid API key input", input.error.issues);
      const generated = createApiKey();
      const apiKey = await context.db.$transaction(async (transaction) => {
        const created = await transaction.apiKey.create({
          data: {
            ...generated,
            projectId,
            name: input.data.name,
            expiresAt: input.data.expiresAt ?? null
          }
        });
        await transaction.auditEvent.create({
          data: {
            projectId,
            userId: user.id,
            action: "API_KEY_CREATED",
            resourceType: "ApiKey",
            resourceId: created.id,
            metadata: { name: created.name }
          }
        });
        return created;
      });
      return reply.status(201).send({ data: { ...toApiKey(apiKey), key: generated.plainText } });
    }
  );

  app.delete<{ Params: { projectId: string; apiKeyId: string } }>(
    "/api/projects/:projectId/api-keys/:apiKeyId",
    async (request) => {
      const { projectId, apiKeyId } = request.params;
      const { user, membership } = await requireProjectMember(request, context, projectId);
      assertAdminRole(membership.role);
      const key = await context.db.apiKey.findFirst({ where: { id: apiKeyId, projectId } });
      if (!key) throw new AppError("NOT_FOUND", "API key was not found", 404);
      const revoked = await context.db.$transaction(async (transaction) => {
        const updated = await transaction.apiKey.update({
          where: { id: key.id },
          data: { revokedAt: new Date() }
        });
        await transaction.auditEvent.create({
          data: {
            projectId,
            userId: user.id,
            action: "API_KEY_REVOKED",
            resourceType: "ApiKey",
            resourceId: key.id,
            metadata: {}
          }
        });
        return updated;
      });
      return { data: toApiKey(revoked) };
    }
  );
}

function toApiKey(key: {
  id: string;
  projectId: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: key.id,
    projectId: key.projectId,
    name: key.name,
    keyPrefix: key.keyPrefix,
    lastUsedAt: key.lastUsedAt?.toISOString() ?? null,
    expiresAt: key.expiresAt?.toISOString() ?? null,
    revokedAt: key.revokedAt?.toISOString() ?? null,
    createdAt: key.createdAt.toISOString()
  };
}
