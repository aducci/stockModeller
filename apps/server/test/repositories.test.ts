// Starting over (storage §7): a repository from an exported or an empty metamodel, and deleting a repository with
// everything in it.
import { afterAll, beforeAll, expect, it } from "vitest";
import { sql } from "kysely";
import type { RepositorySnapshot } from "@connectome/engine";
import { PROBLEM, REPO, describeDb, expectContract, schema, setup } from "./helpers";

describeDb("creating and deleting repositories", () => {
  let api: Awaited<ReturnType<typeof setup>>;
  beforeAll(async () => {
    api = await setup();
  });
  afterAll(() => api?.close());

  const snapshot = async (repo: string) => (await api.get(`/repositories/${repo}/snapshot`)).body as RepositorySnapshot;

  it("starts a repository from another one's exported metamodel", async () => {
    const { metamodel } = await snapshot(REPO);
    const res = await api.post("/repositories", { name: "Copy", metamodel });
    expect(res.status).toBe(201);
    expectContract(res.body, schema("Repository"));
    const copy = await snapshot((res.body as { id: string }).id);
    expect(copy.metamodel.package.objectTypes).toEqual(metamodel.package.objectTypes);
    expect(copy.metamodel.diagramTypes.map((d) => d.key)).toEqual(metamodel.diagramTypes.map((d) => d.key));
    expect(copy.rows.objects).toEqual([]);
  });

  it("starts a repository from scratch with an empty metamodel", async () => {
    const empty = { package: { name: "Mine", objectTypes: [], relationshipTypes: [] }, diagramTypes: [] };
    const res = await api.post("/repositories", { name: "From scratch", metamodel: empty });
    expect(res.status).toBe(201);
    const { metamodel } = await snapshot((res.body as { id: string }).id);
    expect(metamodel.package).toMatchObject({ name: "Mine", version: "1.0.0", objectTypes: [] });
    expect(metamodel.diagramTypes).toEqual([]);
  });

  it("refuses a metamodel that does not compile", async () => {
    const broken = {
      package: { name: "Broken", objectTypes: [{ key: "a", name: "A", extends: "nothing" }], relationshipTypes: [] },
      diagramTypes: [],
    };
    const res = await api.post("/repositories", { name: "Broken", metamodel: broken });
    expect(res.status).toBe(422);
    expectContract(res.body, PROBLEM);
    expect(JSON.stringify(res.body)).toContain("unknown type");
  });

  it("deletes a repository and everything in it", async () => {
    const { metamodel } = await snapshot(REPO);
    const copy = (await api.post("/repositories", { name: "To delete", metamodel })).body as { id: string };
    const res = await api.delete(`/repositories/${REPO}`);
    expect(res.status).toBe(204);
    expect((await api.get(`/repositories/${REPO}`)).status).toBe(404);
    expect((await api.delete(`/repositories/${REPO}`)).status).toBe(404);
    const listed = (await api.get("/repositories")).body as { id: string }[];
    expect(listed.map((r) => r.id)).toContain(copy.id);
    expect(listed.map((r) => r.id)).not.toContain(REPO);

    // No row of any table still names the repository.
    const tables = await sql<{ table_name: string }>`
      SELECT DISTINCT c.table_name FROM information_schema.columns c
      JOIN information_schema.tables t USING (table_schema, table_name)
      WHERE c.table_schema = 'public' AND c.column_name = 'repository_id' AND t.table_type = 'BASE TABLE'`.execute(
      api.db.admin.db,
    );
    for (const { table_name } of tables.rows) {
      const left = await sql<{ n: number }>`SELECT count(*)::int AS n FROM ${sql.table(table_name)}
        WHERE repository_id = ${REPO}`.execute(api.db.admin.db);
      expect(left.rows[0]!.n, table_name).toBe(0);
    }
  });

  it("does not delete another workspace's repository", async () => {
    const mine = (await api.post("/repositories", { name: "Mine" })).body as { id: string };
    const res = await api.delete(`/repositories/${mine.id}`, "Bearer dev:W2:eve@example.com");
    expect(res.status).toBe(404);
    expect((await api.get(`/repositories/${mine.id}`)).status).toBe(200);
  });
});
