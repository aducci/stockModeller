// Cross-tenant isolation (architecture.md §3): a workspace never sees or writes another workspace's rows.
import { afterAll, beforeAll, expect, it } from "vitest";
import { sql } from "kysely";
import { essentials } from "@connectome/content";
import { createRepository, createWorkspace, withWorkspace } from "../src";
import { createTestDatabase, describeDb, type TestDatabase } from "./testdb";

describeDb("tenant isolation", () => {
  let t: TestDatabase;

  beforeAll(async () => {
    t = await createTestDatabase();
    for (const ws of ["WA", "WB"]) {
      await withWorkspace(t.conn, ws, async (tx) => {
        await createWorkspace(tx, { id: ws, name: `Workspace ${ws}` });
        await createRepository(tx, {
          id: `${ws}-R`,
          workspaceId: ws,
          name: "EA",
          baselineScenarioId: `${ws}-S`,
          ...essentials,
        });
        await tx
          .insertInto("folder")
          .values({ id: `${ws}-F`, workspace_id: ws, repository_id: `${ws}-R`, parent_id: null, name: "Apps" })
          .execute();
      });
    }
  });
  afterAll(() => t?.drop());

  it("shows each workspace only its own rows", async () => {
    for (const ws of ["WA", "WB"]) {
      const repos = await withWorkspace(t.conn, ws, (tx) => tx.selectFrom("repository").select("id").execute());
      expect(repos.map((r) => r.id)).toEqual([`${ws}-R`]);
      const types = await withWorkspace(t.conn, ws, (tx) =>
        tx.selectFrom("object_type").select("repository_id").distinct().execute(),
      );
      expect(types.map((r) => r.repository_id)).toEqual([`${ws}-R`]);
    }
  });

  it("refuses to write a row into another workspace", async () => {
    const write = withWorkspace(t.conn, "WA", (tx) =>
      tx
        .insertInto("folder")
        .values({ id: "X", workspace_id: "WB", repository_id: "WB-R", parent_id: null, name: "Sneaky" })
        .execute(),
    );
    await expect(write).rejects.toThrow(/row-level security/);
  });

  it("cannot update or delete another workspace's rows", async () => {
    await withWorkspace(t.conn, "WA", async (tx) => {
      const updated = await tx
        .updateTable("folder")
        .set({ name: "Hacked" })
        .where("id", "=", "WB-F")
        .executeTakeFirst();
      expect(updated.numUpdatedRows).toBe(0n);
      const deleted = await tx.deleteFrom("folder").where("id", "=", "WB-F").executeTakeFirst();
      expect(deleted.numDeletedRows).toBe(0n);
    });
  });

  it("shows nothing when no workspace is set", async () => {
    const rows = await t.conn.db.transaction().execute(async (tx) => {
      await sql`set local role connectome_app`.execute(tx);
      return tx.selectFrom("repository").select("id").execute();
    });
    expect(rows).toEqual([]);
  });
});
