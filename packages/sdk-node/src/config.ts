import { normalizeIgnoredPaths } from "./paths.js";
import type { RequestLabOptions } from "./types.js";

export type ResolvedRequestLabOptions = Required<
  Pick<
    RequestLabOptions,
    | "captureMode"
    | "ignorePaths"
    | "timeoutMs"
    | "maxBodyBytes"
    | "maxQueueSize"
    | "captureStackTrace"
    | "debug"
  >
> &
  Omit<
    RequestLabOptions,
    | "captureMode"
    | "ignorePaths"
    | "excludePaths"
    | "timeoutMs"
    | "maxBodyBytes"
    | "maxQueueSize"
    | "captureStackTrace"
    | "debug"
  >;

export function resolveOptions(options: RequestLabOptions): ResolvedRequestLabOptions {
  if (!options.apiUrl?.trim()) throw new Error("RequestLab apiUrl is required");
  if (!options.apiKey?.trim()) throw new Error("RequestLab apiKey is required");
  if (!options.apiKey.startsWith("rlk_")) throw new Error("RequestLab apiKey must start with rlk_");
  if (!options.environment?.trim()) throw new Error("RequestLab environment is required");
  try {
    new URL(options.apiUrl);
  } catch {
    throw new Error("RequestLab apiUrl must be a valid URL");
  }
  const resolved = {
    ...options,
    apiUrl: options.apiUrl.replace(/\/$/, ""),
    captureMode: options.captureMode ?? "errors",
    ignorePaths: normalizeIgnoredPaths(options.ignorePaths, options.excludePaths),
    timeoutMs: options.timeoutMs ?? 1000,
    maxBodyBytes: options.maxBodyBytes ?? 128 * 1024,
    maxQueueSize: options.maxQueueSize ?? 100,
    captureStackTrace: options.captureStackTrace ?? false,
    debug: options.debug ?? false
  };
  if (resolved.timeoutMs < 1 || resolved.maxBodyBytes < 1 || resolved.maxQueueSize < 1) {
    throw new Error("RequestLab numeric options must be greater than zero");
  }
  return resolved;
}
