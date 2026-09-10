import { createHash } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { AppError } from "./errors.js";

type Bucket = { count: number; resetAt: number };

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number
  ) {}

  check(key: string): void {
    const now = Date.now();
    const current = this.buckets.get(key);
    const bucket =
      !current || current.resetAt <= now ? { count: 0, resetAt: now + this.windowMs } : current;
    bucket.count += 1;
    this.buckets.set(key, bucket);
    if (bucket.count > this.max) {
      throw new AppError("RATE_LIMITED", "Too many requests", 429, {
        retryAfterSeconds: Math.ceil((bucket.resetAt - now) / 1000)
      });
    }
  }
}

export function clientKey(request: FastifyRequest, scope: string, claim?: string): string {
  const identity = claim ? createHash("sha256").update(claim).digest("hex") : request.ip;
  return `${scope}:${identity}`;
}
