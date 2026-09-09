export type AppConfig = {
  nodeEnv: string;
  devUserId?: string;
  apiPort: number;
  corsAllowedOrigins?: string[];
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
    corsAllowedOrigins:
      process.env.NODE_ENV === "production"
        ? configuredOrigins
        : [...new Set([...developmentOrigins, ...configuredOrigins])]
  };
}
