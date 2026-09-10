import { isIP } from "node:net";
import { AppError } from "./errors.js";

export function buildReplayTarget(
  baseUrl: string | null,
  path: string,
  production: boolean,
  allowPrivate: boolean,
  allowedHosts: string[] = []
): string {
  if (!baseUrl || path.startsWith("//"))
    throw new AppError("REPLAY_TARGET_INVALID", "Replay target is invalid", 400);
  let base: URL;
  let target: URL;
  try {
    base = new URL(baseUrl);
    target = new URL(path, base);
  } catch {
    throw new AppError("REPLAY_TARGET_INVALID", "Replay target is invalid", 400);
  }
  if (
    !["http:", "https:"].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.host !== target.host ||
    target.username ||
    target.password
  )
    throw new AppError("REPLAY_TARGET_INVALID", "Replay target is invalid", 400);
  if (
    production &&
    (target.protocol !== "https:" ||
      (allowedHosts.length > 0 && !allowedHosts.includes(target.hostname.toLowerCase())))
  )
    throw new AppError("REPLAY_TARGET_INVALID", "Replay target is not allowed", 400);
  if (production || (!allowPrivate && isPrivateHost(target.hostname)))
    throw new AppError("REPLAY_TARGET_INVALID", "Replay target is not allowed", 400);
  return target.toString();
}

export function isPrivateHost(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (normalized.startsWith("::ffff:")) return isPrivateHost(normalized.slice(7));
  if (normalized === "localhost" || normalized === "metadata.google.internal") return true;
  const version = isIP(normalized);
  if (version === 4) {
    const octets = normalized.split(".").map(Number);
    const a = octets[0] ?? -1;
    const b = octets[1] ?? -1;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a >= 224 && a <= 255)
    );
  }
  if (version === 6) {
    return (
      normalized === "::1" ||
      normalized === "::" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb") ||
      normalized.startsWith("ff")
    );
  }
  return false;
}
