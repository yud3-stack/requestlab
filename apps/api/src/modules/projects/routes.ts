import type { FastifyInstance } from "fastify";
import { CreateProjectInputSchema } from "@requestlab/shared";
import { requireProjectMember, requireUser } from "../../lib/auth.js";
import { isDemoSession, resolveDemoProject } from "../../lib/demo-session.js";
import { AppError, validationError } from "../../lib/errors.js";
import type { AppContext } from "../../types/context.js";

export function registerProjectRoutes(app: FastifyInstance, context: AppContext): void {
  app.get("/api/projects", async (request) => {
    const user = await requireUser(request, context);
    const demo =
      context.config.nodeEnv === "production" && request.headers.authorization
        ? isDemoSession(request, context)
        : false;
    const projects = await context.db.project.findMany({
      where: demo
        ? { id: (await resolveDemoProject(context)).id }
        : { memberships: { some: { userId: user.id } } },
      orderBy: { createdAt: "desc" }
    });
    return { data: projects.map(toProject) };
  });

  app.post("/api/projects", async (request, reply) => {
    if (context.config.nodeEnv === "production" && request.headers.authorization)
      throw new AppError("FORBIDDEN", "Demo sessions cannot create projects", 403);
    const user = await requireUser(request, context);
    const input = CreateProjectInputSchema.safeParse(request.body);
    if (!input.success) throw validationError("Invalid project input", input.error.issues);
    try {
      const project = await context.db.$transaction(async (transaction) => {
        const created = await transaction.project.create({ data: input.data });
        await transaction.projectMember.create({
          data: { projectId: created.id, userId: user.id, role: "OWNER" }
        });
        return created;
      });
      return reply.status(201).send({ data: toProject(project) });
    } catch (error) {
      if (isUniqueConstraint(error)) throw validationError("Project slug is already in use");
      throw error;
    }
  });

  app.get<{ Params: { projectId: string } }>("/api/projects/:projectId", async (request) => {
    const { projectId } = request.params;
    await requireProjectMember(request, context, projectId);
    const project = await context.db.project.findUnique({ where: { id: projectId } });
    if (!project) throw new AppError("NOT_FOUND", "Project was not found", 404);
    return { data: toProject(project) };
  });
}

function toProject(project: {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: project.id,
    name: project.name,
    slug: project.slug,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString()
  };
}

function isUniqueConstraint(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
