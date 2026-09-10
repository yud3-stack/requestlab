export type AppConfig = {
  nodeEnv: string;
  devUserId?: string;
  apiPort: number;
  corsAllowedOrigins?: string[];
  redisUrl?: string;
  allowPrivateReplayTargets?: boolean;
  replayTimeoutMs?: number;
  replayMaxResponseBytes?: number;
};

const developmentOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"];

function parseOrigins(value: string | undefined): string[] {
  return (
    value
      ?.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean) ?? []
  );
}

export function loadConfig(): AppConfig {
  const configuredOrigins = parseOrigins(process.env.CORS_ALLOWED_ORIGINS);
  return {
    nodeEnv: process.env.NODE_ENV ?? "development",
    devUserId: process.env.DEV_USER_ID || undefined,
    apiPort: Number(process.env.API_PORT ?? 3001),
    redisUrl: process.env.REDIS_URL || undefined,
    allowPrivateReplayTargets:
      process.env.NODE_ENV === "development" && process.env.ALLOW_PRIVATE_REPLAY_TARGETS === "true",
    replayTimeoutMs: Number(process.env.REPLAY_TIMEOUT_MS ?? 10000),
    replayMaxResponseBytes: Number(process.env.REPLAY_MAX_RESPONSE_BYTES ?? 128 * 1024),
    corsAllowedOrigins:
      process.env.NODE_ENV === "production"
        ? configuredOrigins
        : [...new Set([...developmentOrigins, ...configuredOrigins])]
  };
}
