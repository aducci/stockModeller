// The engine and the database together: commit changes, read the scenario back, compare with the engine's state.
import { afterAll, beforeAll, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { essentials } from "@connectome/content";
import { applyChange, invertLog, type ModelState } from "@connectome/engine";
import type { Actor, Change, Edit } from "@connectome/model";
import {
  changeLogSince,
  commitChange,
  createRepository,
  createScenario,
  createWorkspace,
  findChange,
  loadMetamodel,
  loadMetamodelPackage,
  loadState,
  lockRepository,
  markWritten,
  MIGRATIONS_DIR,
  withWorkspace,
  type Connection,
} from "../src";
import { createTestDatabase, describeDb, type TestDatabase } from "./testdb";
import {
  BASELINE,
  TARGET_2027,
  exampleBaselineChange,
  exampleScenarioChange,
  snapshot,
} from "../../engine/test/fixtures";

const WS = "W1";
const REPO = "R0000000000000000000000001";
const dana: Actor = { kind: "user", id: "U-DANA" };

/** The server's write path in its simplest form: lock, load current state, apply, commit. */
async function submit(conn: Connection, change: Change) {
  return withWorkspace(conn, WS, async (tx) => {
    await lockRepository(tx, REPO);
    const metamodel = await loadMetamodel(tx, REPO);
    const { state } = await loadState(tx, REPO, change.scenarioId);
    const isBaseline = change.scenarioId === BASELINE;
    const result = applyChange(state, change, {
      metamodel,
      actor: dana,
      scenario: { id: change.scenarioId, isBaseline },
    });
    if (!result.ok) return { ok: false as const, reasons: result.reasons };
    const committed = await commitChange(tx, {
      workspaceId: WS,
      repositoryId: REPO,
      change,
      actor: dana,
      source: "api",
      ...result,
    });
    markWritten(state, result.touched, change.scenarioId);
    return { ok: true as const, committed, state };
  });
}

const sortByKey = <T extends { key: string }>(items: T[] = []) => [...items].sort((a, b) => a.key.localeCompare(b.key));

describeDb("engine + database", () => {
  let t: TestDatabase;

  beforeAll(async () => {
    t = await createTestDatabase();
    await withWorkspace(t.conn, WS, async (tx) => {
      await createWorkspace(tx, { id: WS, name: "Insurance Group" });
      await createRepository(tx, {
        id: REPO,
        workspaceId: WS,
        name: "Insurance Group EA",
        baselineScenarioId: BASELINE,
        ...essentials,
      });
    });
  });
  afterAll(() => t?.drop());

  it("stores the Essentials metamodel and reads it back unchanged", async () => {
    const { metamodel, diagramTypes } = await withWorkspace(t.conn, WS, (tx) => loadMetamodelPackage(tx, REPO));
    const pkg = essentials.metamodel;
    expect(metamodel.name).toBe(pkg.name);
    expect(metamodel.version).toBe(pkg.version);
    expect(metamodel.layers).toEqual(pkg.layers);
    expect(metamodel.exchangeMappings).toEqual(pkg.exchangeMappings);
    expect(metamodel.documentPatterns).toEqual(pkg.documentPatterns);
    expect(sortByKey(metamodel.objectTypes)).toEqual(sortByKey(pkg.objectTypes));
    expect(sortByKey(metamodel.relationshipTypes)).toEqual(sortByKey(pkg.relationshipTypes));
    expect(sortByKey(metamodel.propertyTypes)).toEqual(sortByKey(pkg.propertyTypes));
    expect(sortByKey(metamodel.valueLists)).toEqual(sortByKey(pkg.valueLists));
    expect(sortByKey(metamodel.validationRules)).toEqual(sortByKey(pkg.validationRules));
    expect(metamodel.relationshipRules).toHaveLength(pkg.relationshipRules!.length);
    expect(sortByKey(diagramTypes)).toEqual(sortByKey(essentials.diagramTypes));
  });

  let committedBaseline: ModelState;

  it("commits the example repository and reads back exactly the engine's state", async () => {
    const result = await submit(t.conn, exampleBaselineChange());
    if (!result.ok) throw new Error(JSON.stringify(result.reasons));
    expect(result.committed.seq).toBe(1);
    committedBaseline = result.state;
    const { state, seq } = await withWorkspace(t.conn, WS, (tx) => loadState(tx, REPO, BASELINE));
    expect(seq).toBe(1);
    expect(snapshot(state)).toEqual(snapshot(committedBaseline));
    expect(state.objects.get("O-APP-1")).toEqual(committedBaseline.objects.get("O-APP-1"));
  });

  it("is idempotent on the change id", async () => {
    const existing = await withWorkspace(t.conn, WS, (tx) => findChange(tx, "C-EXAMPLE"));
    expect(existing).toMatchObject({ seq: 1, label: "Load example repository", source: "api" });
  });

  it("keeps a scenario's edits out of the baseline, and records the base version of copied rows", async () => {
    await withWorkspace(t.conn, WS, (tx) =>
      createScenario(tx, {
        id: TARGET_2027,
        workspaceId: WS,
        repositoryId: REPO,
        parentId: BASELINE,
        name: "Target 2027",
      }),
    );
    const scenarioState = await withWorkspace(t.conn, WS, (tx) => loadState(tx, REPO, TARGET_2027));
    const result = await submit(t.conn, exampleScenarioChange(scenarioState.state));
    if (!result.ok) throw new Error(JSON.stringify(result.reasons));
    expect(result.committed.seq).toBe(2);

    const baseline = await withWorkspace(t.conn, WS, (tx) => loadState(tx, REPO, BASELINE));
    expect(snapshot(baseline.state)).toEqual(snapshot(committedBaseline));

    const target = await withWorkspace(t.conn, WS, (tx) => loadState(tx, REPO, TARGET_2027));
    expect(snapshot(target.state)).toEqual(snapshot(result.state));
    expect(target.state.objects.get("O-APP-2")).toMatchObject({
      scenarioId: TARGET_2027,
      baseVersion: 1,
      version: 2,
      properties: expect.objectContaining({ "lifecycle.status": "retired" }),
    });
    expect(target.state.objects.get("O-APP-1")!.scenarioId).toBe(BASELINE); // untouched rows come from the baseline
    expect(target.state.relationships.get("R-09")).toBeUndefined();

    // Rows are copied into the scenario once: the second edit keeps the original base version.
    const again = await submit(t.conn, {
      id: "C-TARGET-2",
      scenarioId: TARGET_2027,
      label: "Rename",
      edits: [{ edit: "renameObject", id: "O-APP-2", baseVersion: 2, name: "Legacy CRM (retiring)" }],
    });
    expect(again.ok && again.state.objects.get("O-APP-2")).toMatchObject({ baseVersion: 1, version: 3 });
  });

  it("shows baseline edits in a scenario unless the scenario changed the item", async () => {
    const result = await submit(t.conn, {
      id: "C-BASE-RENAME",
      scenarioId: BASELINE,
      label: "Rename",
      edits: [{ edit: "renameObject", id: "O-SRV-1", baseVersion: 1, name: "SRV-APP-01 (DC1)" }],
    });
    expect(result.ok).toBe(true);
    const target = await withWorkspace(t.conn, WS, (tx) => loadState(tx, REPO, TARGET_2027));
    expect(target.state.objects.get("O-SRV-1")!.name).toBe("SRV-APP-01 (DC1)");
  });

  it("stores confirmations and reads them back exactly", async () => {
    const before = await withWorkspace(t.conn, WS, (tx) => loadState(tx, REPO, BASELINE));
    const server = before.state.objects.get("O-SRV-1")!;
    const result = await submit(t.conn, {
      id: "C-CONFIRM",
      scenarioId: BASELINE,
      label: "Confirm",
      edits: [
        { edit: "confirmProperties", id: "O-SRV-1", baseVersion: server.version, keys: ["semantic.abstraction"] },
      ],
    });
    if (!result.ok) throw new Error(JSON.stringify(result.reasons));
    const after = await withWorkspace(t.conn, WS, (tx) => loadState(tx, REPO, BASELINE));
    expect(after.state.objects.get("O-SRV-1")!.confirmations).toEqual({
      "semantic.abstraction": { by: "U-DANA", at: result.state.objects.get("O-SRV-1")!.updatedAt },
    });
    expect(snapshot(after.state)).toEqual(snapshot(result.state));
  });

  it("stores aliases and not-duplicate judgements and reads them back exactly", async () => {
    const before = await withWorkspace(t.conn, WS, (tx) => loadState(tx, REPO, BASELINE));
    const server = before.state.objects.get("O-SRV-1")!;
    const verdict = { of: "O-OTHER", name: server.name, otherName: "Another server" };
    const result = await submit(t.conn, {
      id: "C-ALIASES",
      scenarioId: BASELINE,
      label: "Aliases",
      edits: [
        { edit: "setAliases", id: "O-SRV-1", baseVersion: server.version, aliases: ["App server", "SRV1"] },
        { edit: "setNotDuplicates", id: "O-SRV-1", baseVersion: server.version, notDuplicates: [verdict] },
      ],
    });
    if (!result.ok) throw new Error(JSON.stringify(result.reasons));
    const after = await withWorkspace(t.conn, WS, (tx) => loadState(tx, REPO, BASELINE));
    expect(after.state.objects.get("O-SRV-1")!.aliases).toEqual(["App server", "SRV1"]);
    expect(after.state.objects.get("O-SRV-1")!.notDuplicates).toEqual([verdict]);
    expect(snapshot(after.state)).toEqual(snapshot(result.state));
  });

  it("stores a view definition and reads it back exactly", async () => {
    const before = await withWorkspace(t.conn, WS, (tx) => loadState(tx, REPO, BASELINE));
    const diagram = [...before.state.diagrams.live()][0]!;
    const set = { hideEmpty: true, rows: { from: { type: ["capability"] } } };
    const result = await submit(t.conn, {
      id: "C-VIEW",
      scenarioId: BASELINE,
      label: "Define view",
      edits: [{ edit: "setViewDefinition", diagramId: diagram.id, baseVersion: diagram.version, set }],
    });
    if (!result.ok) throw new Error(JSON.stringify(result.reasons));
    const after = await withWorkspace(t.conn, WS, (tx) => loadState(tx, REPO, BASELINE));
    expect(after.state.diagrams.get(diagram.id)!.definition).toEqual(set);
    expect(snapshot(after.state)).toEqual(snapshot(result.state));
  });

  it("undoes a committed change from the inverses stored in change_log", async () => {
    const before = await withWorkspace(t.conn, WS, (tx) => loadState(tx, REPO, BASELINE));
    const deleted = await submit(t.conn, {
      id: "C-DELETE",
      scenarioId: BASELINE,
      label: "Delete Claims Manager",
      edits: [{ edit: "deleteObject", id: "O-APP-1", baseVersion: 1 }],
    });
    if (!deleted.ok) throw new Error(JSON.stringify(deleted.reasons));

    const log = await withWorkspace(t.conn, WS, (tx) => changeLogSince(tx, REPO, deleted.committed.seq - 1));
    expect(log).toHaveLength(1);
    const inverse = invertLog(
      log.map((r) => ({
        editIndex: r.edit_index,
        itemId: r.item_id,
        edit: r.edit as Edit,
        inverse: r.inverse as Edit[],
      })),
    );
    const undone = await submit(t.conn, {
      id: "C-UNDO",
      scenarioId: BASELINE,
      label: "Undo: Delete Claims Manager",
      edits: inverse,
    });
    if (!undone.ok) throw new Error(JSON.stringify(undone.reasons));

    const after = await withWorkspace(t.conn, WS, (tx) => loadState(tx, REPO, BASELINE));
    expect(snapshot(after.state)).toEqual(snapshot(before.state));
    expect(after.state.objects.get("O-APP-1")!.version).toBe(3);
  });

  it("rejects a conflicting change without writing anything", async () => {
    const seqBefore = await withWorkspace(t.conn, WS, (tx) => lockRepository(tx, REPO));
    const result = await submit(t.conn, {
      id: "C-STALE",
      scenarioId: BASELINE,
      label: "Stale rename",
      edits: [{ edit: "renameObject", id: "O-SRV-1", baseVersion: 1, name: "Other name" }],
    });
    expect(result).toMatchObject({ ok: false, reasons: [{ code: "conflict", property: "name", changedBy: dana.id }] });
    expect(await withWorkspace(t.conn, WS, (tx) => lockRepository(tx, REPO))).toBe(seqBefore);
  });

  it("serialises concurrent writers per repository: every change gets its own sequence number", async () => {
    const start = await withWorkspace(t.conn, WS, (tx) => lockRepository(tx, REPO));
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        submit(t.conn, {
          id: `C-PAR-${i}`,
          scenarioId: BASELINE,
          label: `Folder ${i}`,
          edits: [{ edit: "createFolder", id: `F-PAR-${i}`, parentId: null, name: `Parallel ${i}` }],
        }),
      ),
    );
    const seqs = results.map((r) => (r.ok ? r.committed.seq : -1)).sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: 8 }, (_, i) => start + i + 1));
  });

  it("migration 012 renames the stored level to abstraction (B62) and loses nothing", async () => {
    const before = await withWorkspace(t.conn, WS, (tx) => loadState(tx, REPO, BASELINE));
    const types = await withWorkspace(t.conn, WS, (tx) => loadMetamodelPackage(tx, REPO));
    expect(before.state.objects.get("O-SRV-1")!.confirmations).toHaveProperty(["semantic.abstraction"]);
    // Write the rows back as they were stored before the rename, then run the migration again.
    const client = new pg.Client({ connectionString: t.url });
    await client.connect();
    try {
      await client.query(`
        UPDATE object SET properties = replace(properties::text, 'semantic.abstraction', 'semantic.level')::jsonb,
          field_versions = replace(field_versions::text, 'semantic.abstraction', 'semantic.level')::jsonb,
          confirmations = replace(confirmations::text, 'semantic.abstraction', 'semantic.level')::jsonb;
        UPDATE object_type SET definition = (SELECT jsonb_object_agg(CASE key WHEN 'abstraction' THEN 'level'
          WHEN 'abstractionFixed' THEN 'levelFixed' ELSE key END, value) FROM jsonb_each(definition))
          WHERE definition ? 'abstraction';
        UPDATE change_log SET edit = replace(edit::text, 'semantic.abstraction', 'semantic.level')::jsonb;`);
      const old = await client.query("select count(*)::int as n from object where properties ? 'semantic.level'");
      expect(old.rows[0].n).toBeGreaterThan(0);
      await client.query(await readFile(MIGRATIONS_DIR + "012_abstraction_rename.sql", "utf8"));
      const left = await client.query(
        "select count(*)::int as n from change_log where edit::text like '%semantic.level%'",
      );
      expect(left.rows[0].n).toBe(0);
    } finally {
      await client.end();
    }
    const after = await withWorkspace(t.conn, WS, (tx) => loadState(tx, REPO, BASELINE));
    expect(snapshot(after.state)).toEqual(snapshot(before.state));
    expect(after.state.objects.get("O-SRV-1")).toEqual(before.state.objects.get("O-SRV-1"));
    const typesAfter = await withWorkspace(t.conn, WS, (tx) => loadMetamodelPackage(tx, REPO));
    expect(sortByKey(typesAfter.metamodel.objectTypes)).toEqual(sortByKey(types.metamodel.objectTypes));
  });

  it("migration 013 turns Documentation values into links of the right kind (B70)", async () => {
    // Put the database back as it was before links: the table gone, the values in the property, no link kinds.
    const client = new pg.Client({ connectionString: t.url });
    await client.connect();
    try {
      await client.query(`
        DROP TABLE link;
        UPDATE object SET properties = properties || '{"documentation.link":
          ["https://wiki.example.com/claims-manager", "diagram:D-04", "diagram:D-03"]}'::jsonb
          WHERE repository_id = '${REPO}' AND id = 'O-APP-1' AND scenario_id = '${BASELINE}';
        UPDATE object SET properties = properties || '{"documentation.link": "diagram:D-05"}'::jsonb
          WHERE repository_id = '${REPO}' AND id = 'O-FN-1' AND scenario_id = '${BASELINE}';
        UPDATE diagram_type SET definition = jsonb_set(definition #- '{subject,linkKind}', '{subject,linkProperty}',
          '"documentation.link"') WHERE definition->'subject' ? 'linkKind';
        UPDATE repository SET settings = settings #- '{metamodel,linkKinds}';`);
      await client.query(await readFile(MIGRATIONS_DIR + "013_links.sql", "utf8"));
    } finally {
      await client.end();
    }
    const after = await withWorkspace(t.conn, WS, (tx) => loadState(tx, REPO, BASELINE));
    const linksOf = (id: string) => after.state.links.find("bySource", id).map((l) => [l.kind, l.target]);
    expect(linksOf("O-APP-1")).toEqual([
      ["web", { url: "https://wiki.example.com/claims-manager" }],
      ["document", { diagramId: "D-04" }],
      ["drillDown", { diagramId: "D-03" }],
    ]);
    expect(linksOf("O-FN-1")).toEqual([["drillDown", { diagramId: "D-05" }]]);
    expect(after.state.objects.get("O-APP-1")!.properties).not.toHaveProperty(["documentation.link"]);
    const { metamodel, diagramTypes } = await withWorkspace(t.conn, WS, (tx) => loadMetamodelPackage(tx, REPO));
    expect(metamodel.linkKinds).toEqual(essentials.metamodel.linkKinds);
    expect(diagramTypes.find((d) => d.key === "hld")!.subject).toEqual({ linkKind: "document" });
    expect(diagramTypes.find((d) => d.key === "context")!.subject).toEqual(
      essentials.diagramTypes.find((d) => d.key === "context")!.subject,
    );
  });
});
