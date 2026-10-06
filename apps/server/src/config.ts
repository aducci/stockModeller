// Server configuration from the environment.
export interface Config {
  host: string;
  port: number;
  databaseUrl: string;
  /** Development sign-in: accepts "Bearer dev:<workspaceId>:<userId>". Never in production. */
  devAuth: boolean;
  logLevel: string;
  /** Signs live-connection tickets; must be the same on every instance. */
  secret: string | undefined;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const devAuth = env.CONNECTOME_DEV_AUTH === "1";
  if (devAuth && env.NODE_ENV === "production") {
    throw new Error("CONNECTOME_DEV_AUTH must not be enabled when NODE_ENV=production");
  }
  if (env.NODE_ENV === "production" && !env.CONNECTOME_SECRET) {
    throw new Error("CONNECTOME_SECRET is required in production (it signs live-connection tickets on every instance)");
  }
  return {
    host: env.HOST ?? "127.0.0.1",
    port: Number(env.PORT ?? 3000),
    databaseUrl,
    devAuth,
    logLevel: env.LOG_LEVEL ?? "info",
    secret: env.CONNECTOME_SECRET,
  };
}
