export type AppConfig = {
  nodeEnv: string;
  devUserId?: string;
  apiPort: number;
  corsAllowedOrigins?: string[];
  redisUrl?: string;
  allowPrivateReplayTargets?: boolean;
  replayTimeoutMs?: number;
  replayMaxResponseBytes?: number;
  replayAllowedHosts?: string[];
  runReplayWorker?: boolean;
  demoSessionSecret?: string;
  demoTriggerSecret?: string;
  demoApiBaseUrl?: string;
  demoProjectSlug?: string;
  demoScenarioTimeoutMs?: number;
  trustProxy?: boolean;
  rateLimits?: {
    demoSession: number;
    demoScenario: number;
    replayCreate: number;
    authenticated: number;
  };
};

export const DEFAULT_DEMO_SCENARIO_TIMEOUT_MS = 45_000;
export const MAX_DEMO_SCENARIO_TIMEOUT_MS = 60_000;

const developmentOrigins = ["http://localhost:5173", "http://127.0.0.1:5173"];

function parseOrigins(value: string | undefined): string[] {
  return (
    value
      ?.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean) ?? []
  );
}

function parseList(value: string | undefined): string[] {
  return (
    value
      ?.split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean) ?? []
  );
}

function parseDemoScenarioTimeout(value: string | undefined): number {
  const parsed = Number(value ?? DEFAULT_DEMO_SCENARIO_TIMEOUT_MS);
  const timeout = Number.isFinite(parsed) ? Math.floor(parsed) : 0;
  return timeout > 0
    ? Math.min(timeout, MAX_DEMO_SCENARIO_TIMEOUT_MS)
    : DEFAULT_DEMO_SCENARIO_TIMEOUT_MS;
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
    replayAllowedHosts:
      process.env.NODE_ENV === "production"
        ? parseList(process.env.REPLAY_ALLOWED_HOSTS || "demo.requestlab.yusufdere.com")
        : parseList(process.env.REPLAY_ALLOWED_HOSTS),
    runReplayWorker: process.env.RUN_REPLAY_WORKER === "true",
    demoSessionSecret: process.env.DEMO_SESSION_SECRET || undefined,
    demoTriggerSecret: process.env.DEMO_TRIGGER_SECRET || undefined,
    demoApiBaseUrl: process.env.DEMO_API_BASE_URL || undefined,
    demoProjectSlug: process.env.DEMO_PROJECT_SLUG || "requestlab-demo",
    demoScenarioTimeoutMs: parseDemoScenarioTimeout(process.env.DEMO_SCENARIO_TIMEOUT_MS),
    trustProxy: process.env.TRUST_PROXY === "true",
    rateLimits: {
      demoSession: Number(process.env.RATE_LIMIT_DEMO_SESSION ?? 10),
      demoScenario: Number(process.env.RATE_LIMIT_DEMO_SCENARIO ?? 20),
      replayCreate: Number(process.env.RATE_LIMIT_REPLAY_CREATE ?? 10),
      authenticated: Number(process.env.RATE_LIMIT_AUTHENTICATED ?? 120)
    },
    corsAllowedOrigins:
      process.env.NODE_ENV === "production"
        ? configuredOrigins
        : [...new Set([...developmentOrigins, ...configuredOrigins])]
  };
}
