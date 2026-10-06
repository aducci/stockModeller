// Starts the server (role "web"). The worker role arrives with the job queue.
import { connect } from "@connectome/db";
import { buildApp } from "./app";
import { devAuthenticate, noAuthenticate } from "./auth";
import { loadConfig } from "./config";

const config = loadConfig();
const conn = connect({ connectionString: config.databaseUrl });
const app = buildApp({
  conn,
  authenticate: config.devAuth ? devAuthenticate : noAuthenticate,
  logger: { level: config.logLevel },
  live: { connectionString: config.databaseUrl, ...(config.secret ? { ticketSecret: config.secret } : {}) },
});
if (!config.secret) app.log.warn("CONNECTOME_SECRET is not set: live tickets only work on this instance.");
if (!config.devAuth)
  app.log.warn(
    "No sign-in method is configured: every API request will get 401. Set CONNECTOME_DEV_AUTH=1 for development.",
  );

const shutdown = async () => {
  await app.close();
  await conn.close();
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

await app.listen({ host: config.host, port: config.port });
