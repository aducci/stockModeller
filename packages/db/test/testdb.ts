// Each test file gets its own throwaway database, migrated from scratch.
// Database tests run when DATABASE_URL points at a PostgreSQL 16 server the tests may create databases on.
import { describe } from "vitest";
import pg from "pg";
import { connect, migrate, type Connection } from "../src";

export const DATABASE_URL = process.env.DATABASE_URL;

/** `describe` when a database is configured, otherwise skipped (unit tests still run without one). */
export const describeDb = DATABASE_URL ? describe : describe.skip;

export interface TestDatabase {
  url: string;
  /** Connection whose tenant transactions run as connectome_app (row-level security applies). */
  conn: Connection;
  /** Superuser connection: bypasses row-level security, for setup and inspection. */
  admin: Connection;
  drop(): Promise<void>;
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const name = `connectome_test_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const server = new pg.Client({ connectionString: DATABASE_URL });
  await server.connect();
  await server.query(`create database ${name}`);
  await server.end();
  const url = new URL(DATABASE_URL!);
  url.pathname = `/${name}`;
  await migrate(url.toString());
  const conn = connect({ connectionString: url.toString() });
  const admin = connect({ connectionString: url.toString(), appRole: null });
  return {
    url: url.toString(),
    conn,
    admin,
    async drop() {
      await conn.close();
      await admin.close();
      const s = new pg.Client({ connectionString: DATABASE_URL });
      await s.connect();
      await s.query(`drop database if exists ${name} with (force)`);
      await s.end();
    },
  };
}
