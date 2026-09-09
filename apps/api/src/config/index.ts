export type AppConfig = {
  nodeEnv: string;
  devUserId?: string;
  apiPort: number;
};

export function loadConfig(): AppConfig {
  return {
    nodeEnv: process.env.NODE_ENV ?? "development",
    devUserId: process.env.DEV_USER_ID || undefined,
    apiPort: Number(process.env.API_PORT ?? 3001)
  };
}
