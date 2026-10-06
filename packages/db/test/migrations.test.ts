import { afterAll, beforeAll, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { sql } from "kysely";
import { MIGRATIONS_DIR, migrate } from "../src";
import { readDesign } from "../../model/test/design";
import { createTestDatabase, describeDb, type TestDatabase } from "./testdb";

it("starts from the design pack's schema.sql, unchanged", async () => {
  expect(await readFile(MIGRATIONS_DIR + "001_initial_schema.sql", "utf8")).toBe(readDesign("03-platform/schema.sql"));
});

describeDb("migrations", () => {
  let t: TestDatabase;
  beforeAll(async () => (t = await createTestDatabase()));
  afterAll(() => t?.drop());

  it("are applied once", async () => {
    expect(await migrate(t.url)).toEqual([]);
  });

  it("leave no tenant table without forced row-level security", async () => {
    const { rows } = await sql<{ relname: string }>`
      select c.relname from pg_class c
      where c.relnamespace = 'public'::regnamespace and c.relkind in ('r', 'p')
        and c.relname not in ('app_user', 'schema_migration')
        and not (c.relrowsecurity and c.relforcerowsecurity)`.execute(t.admin.db);
    expect(rows.map((r) => r.relname)).toEqual([]);
  });
});
