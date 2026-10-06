// Database access: a Kysely instance over a pg pool, and the per-transaction tenant context.
import pg from "pg";
import { Kysely, PostgresDialect, sql, type Transaction } from "kysely";
import type { Database } from "./schema";

// bigint (seq) as a JS number: sequences stay far below 2^53.
pg.types.setTypeParser(pg.types.builtins.INT8, (v) => Number(v));

export type Db = Kysely<Database>;
export type Tx = Transaction<Database>;

export interface DbOptions {
  connectionString: string;
  /** The role tenant transactions switch to (row-level security applies to it). null keeps the login role. */
  appRole?: string | null;
  maxConnections?: number;
}

export interface Connection {
  db: Db;
  appRole: string | null;
  close(): Promise<void>;
}

export function connect(options: DbOptions): Connection {
  const pool = new pg.Pool({ connectionString: options.connectionString, max: options.maxConnections ?? 10 });
  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  return { db, appRole: options.appRole === undefined ? "connectome_app" : options.appRole, close: () => db.destroy() };
}

/**
 * Runs `fn` in a transaction scoped to one workspace: row-level security then only shows and accepts
 * that workspace's rows. Every request handler reaches the database through this. Reads that span several
 * queries use "repeatable read" so they see one consistent snapshot.
 */
export async function withWorkspace<T>(
  conn: Connection,
  workspaceId: string,
  fn: (tx: Tx) => Promise<T>,
  options: { isolation?: "read committed" | "repeatable read" | "serializable" } = {},
): Promise<T> {
  const transaction = conn.db.transaction();
  return (options.isolation ? transaction.setIsolationLevel(options.isolation) : transaction).execute(async (tx) => {
    await sql`select set_config('app.workspace_id', ${workspaceId}, true)`.execute(tx);
    if (conn.appRole) await sql`set local role ${sql.id(conn.appRole)}`.execute(tx);
    return fn(tx);
  });
}

/** Sends a notification outside any transaction (e.g. presence, which is never stored). */
export async function notify(conn: Connection, channel: string, payload: string): Promise<void> {
  await sql`select pg_notify(${channel}, ${payload})`.execute(conn.db);
}
