// The engine and the database together: commit changes, read the scenario back, compare with the engine's state.
import { afterAll, beforeAll, expect, it } from "vitest";
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
    expect(sortByKey(metamodel.objectTypes)).toEqual(sortByKey(pkg.objectTypes));
    expect(sortByKey(metamodel.relationshipTypes)).toEqual(sortByKey(pkg.relationshipTypes));
    expect(sortByKey(metamodel.propertyTypes)).toEqual(sortByKey(pkg.propertyTypes));
    expect(sortByKey(metamodel.valueLists)).toEqual(sortByKey(pkg.valueLists));
    expect(sortByKey(metamodel.validationRules)).toEqual(sortByKey(pkg.validationRules));
    expect(metamodel.relationshipRules).toHaveLength(pkg.relationshipRules!.length);
    expect(diagramTypes).toEqual(essentials.diagramTypes);
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
      edits: [{ edit: "confirmProperties", id: "O-SRV-1", baseVersion: server.version, keys: ["semantic.level"] }],
    });
    if (!result.ok) throw new Error(JSON.stringify(result.reasons));
    const after = await withWorkspace(t.conn, WS, (tx) => loadState(tx, REPO, BASELINE));
    expect(after.state.objects.get("O-SRV-1")!.confirmations).toEqual({
      "semantic.level": { by: "U-DANA", at: result.state.objects.get("O-SRV-1")!.updatedAt },
    });
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
});
