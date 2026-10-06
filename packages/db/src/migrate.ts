// A small forward-only migration runner: migrations/NNN_name.sql, each applied once, in its own transaction.
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import pg from "pg";

export const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations/", import.meta.url));

export async function listMigrations(dir = MIGRATIONS_DIR): Promise<string[]> {
  return (await readdir(dir)).filter((f) => /^\d{3}_.+\.sql$/.test(f)).sort();
}

/** Applies pending migrations; returns the names applied. Safe to run concurrently (advisory lock). */
export async function migrate(connectionString: string, dir = MIGRATIONS_DIR): Promise<string[]> {
  const client = new pg.Client({ connectionString });
  await client.connect();
  try {
    await client.query("select pg_advisory_lock(hashtext('connectome.migrations'))");
    await client.query(
      "create table if not exists schema_migration (name text primary key, applied_at timestamptz not null default now())",
    );
    const done = new Set(
      (await client.query<{ name: string }>("select name from schema_migration")).rows.map((r) => r.name),
    );
    const applied: string[] = [];
    for (const name of await listMigrations(dir)) {
      if (done.has(name)) continue;
      const text = await readFile(dir + name, "utf8");
      try {
        await client.query("begin");
        await client.query(text);
        await client.query("insert into schema_migration (name) values ($1)", [name]);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw new Error(`Migration ${name} failed: ${(error as Error).message}`, { cause: error });
      }
      applied.push(name);
    }
    return applied;
  } finally {
    await client.query("select pg_advisory_unlock(hashtext('connectome.migrations'))").catch(() => {});
    await client.end();
  }
}
