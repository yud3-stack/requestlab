import type { FastifyInstance } from "fastify";
import { resolveDemoProject, createDemoToken, requireDemoSession } from "../../lib/demo-session.js";
import { clientKey, RateLimiter } from "../../lib/rate-limit.js";
import { AppError } from "../../lib/errors.js";
import type { AppContext } from "../../types/context.js";

const scenarios = new Set(["order-error", "login-error", "slow-request"]);

export function registerDemoRoutes(app: FastifyInstance, context: AppContext): void {
  const limits = context.config.rateLimits ?? {
    demoSession: 10,
    demoScenario: 20,
    replayCreate: 10,
    authenticated: 120
  };
  const sessionLimiter = new RateLimiter(limits.demoSession, 60_000);
  const scenarioLimiter = new RateLimiter(limits.demoScenario, 10 * 60_000);

  app.post("/api/demo/session", async (request) => {
    sessionLimiter.check(clientKey(request, "demo-session"));
    const project = await resolveDemoProject(context);
    const member = await context.db.projectMember.findFirst({
      where: { projectId: project.id },
      orderBy: { createdAt: "asc" }
    });
    if (!member) throw new AppError("DEMO_UNAVAILABLE", "Public demo is not configured", 503);
    if (!context.config.demoSessionSecret)
      throw new AppError("DEMO_UNAVAILABLE", "Public demo is not configured", 503);
    return {
      data: {
        token: createDemoToken(
          { sub: member.userId, projectId: project.id, exp: Date.now() + 30 * 60_000 },
          context.config.demoSessionSecret
        ),
        expiresInSeconds: 1800,
        project: { slug: project.slug }
      }
    };
  });

  app.post<{ Params: { scenario: string } }>("/api/demo/scenarios/:scenario", async (request) => {
    const claims = requireDemoSession(request, context);
    scenarioLimiter.check(clientKey(request, "demo-scenario", claims.sub));
    if (!scenarios.has(request.params.scenario))
      throw new AppError("DEMO_SCENARIO_NOT_FOUND", "Demo scenario was not found", 404);
    const baseUrl = context.config.demoApiBaseUrl;
    if (!baseUrl) throw new AppError("DEMO_UNAVAILABLE", "Demo API is not configured", 503);
    const url = new URL(`/internal/demo/scenarios/${request.params.scenario}`, baseUrl);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(url, {
        method: "POST",
        redirect: "manual",
        headers: context.config.demoTriggerSecret
          ? { "x-requestlab-demo-secret": context.config.demoTriggerSecret }
          : {},
        signal: controller.signal
      });
      if (!response.ok) throw new AppError("DEMO_UNAVAILABLE", "Demo scenario failed", 502);
      return { data: { scenario: request.params.scenario, statusCode: response.status } };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("DEMO_UNAVAILABLE", "Demo scenario is unavailable", 502);
    } finally {
      clearTimeout(timer);
    }
  });
}
