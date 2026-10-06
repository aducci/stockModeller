// Starts a throwaway backend for the end-to-end tests: a fresh database (migrated and seeded with the design
// pack's example repository) and the API server with development sign-in. Dropped again on exit.
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { migrate } from "@connectome/db";

const admin = process.env.DATABASE_URL;
if (!admin)
  throw new Error("The end-to-end tests need DATABASE_URL (a PostgreSQL 16 server they may create databases on)");
const port = process.env.E2E_API_PORT ?? "3100";
const serverDir = fileURLToPath(new URL("../../server/", import.meta.url));

const name = `connectome_e2e_${Date.now().toString(36)}`;
const url = new URL(admin);
url.pathname = `/${name}`;
const databaseUrl = url.toString();

async function query(sql: string) {
  const client = new pg.Client({ connectionString: admin });
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

function run(args: string[], env: NodeJS.ProcessEnv): ChildProcess {
  return spawn(process.execPath, ["--import", "tsx", ...args], { cwd: serverDir, env, stdio: "inherit" });
}

await query(`create database ${name}`);
await migrate(databaseUrl);
const env = { ...process.env, DATABASE_URL: databaseUrl, CONNECTOME_DEV_AUTH: "1", PORT: port, LOG_LEVEL: "warn" };
await new Promise<void>((resolve, reject) =>
  run(["src/cli/seed.ts"], env).on("exit", (code) =>
    code === 0 ? resolve() : reject(new Error(`seed exited ${code}`)),
  ),
);
const server = run(["src/main.ts"], env);

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  server.kill("SIGTERM");
  await new Promise((r) => server.once("exit", r));
  await query(`drop database if exists ${name} with (force)`).catch(() => {});
  process.exit(0);
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
server.on("exit", (code) => {
  if (!stopping) process.exit(code ?? 1);
});
