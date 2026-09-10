import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { AppError } from "./errors.js";
import type { AppContext } from "../types/context.js";

type DemoClaims = { sub: string; projectId: string; scope: "demo"; exp: number };

export function createDemoToken(claims: Omit<DemoClaims, "scope">, secret: string): string {
  const payload: DemoClaims = { ...claims, scope: "demo" };
  const encoded = encode(payload);
  return `${encoded}.${sign(encoded, secret)}`;
}

export function requireDemoSession(request: FastifyRequest, context: AppContext): DemoClaims {
  const secret = context.config.demoSessionSecret;
  if (!secret) throw new AppError("DEMO_UNAVAILABLE", "Public demo is not configured", 503);
  const header = request.headers.authorization;
  const token = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : "";
  const [encoded, signature] = token.split(".");
  if (!encoded || !signature || !validSignature(encoded, signature, secret))
    throw new AppError("UNAUTHORIZED", "A valid demo session is required", 401);
  try {
    const claims = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as DemoClaims;
    if (claims.scope !== "demo" || !claims.sub || !claims.projectId || claims.exp <= Date.now())
      throw new Error("invalid claims");
    return claims;
  } catch {
    throw new AppError("UNAUTHORIZED", "A valid demo session is required", 401);
  }
}

export function isDemoSession(request: FastifyRequest, context: AppContext): boolean {
  return Boolean(request.headers.authorization) && Boolean(requireDemoSession(request, context));
}

export async function resolveDemoProject(context: AppContext): Promise<{
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}> {
  const slug = context.config.demoProjectSlug;
  if (!slug || slug === "*" || slug.includes("/"))
    throw new AppError("DEMO_UNAVAILABLE", "Public demo is not configured", 503);
  const project = await context.db.project.findUnique({ where: { slug } });
  if (!project) throw new AppError("DEMO_UNAVAILABLE", "Public demo is not configured", 503);
  return {
    id: project.id,
    name: project.name,
    slug: project.slug,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt
  };
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}
function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}
function validSignature(value: string, signature: string, secret: string): boolean {
  const expected = Buffer.from(sign(value, secret));
  const actual = Buffer.from(signature);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
