import { describe, expect, it } from "vitest";
import { essentials, insuranceGroup } from "@connectome/content";
import { applyChange, Metamodel, ModelState } from "@connectome/engine";
import type { Edit } from "@connectome/model";
import {
  childrenOf,
  containAsPlan,
  dropPlan,
  dropPosition,
  groupMembers,
  rankBetween,
  rankEdits,
  typeChoices,
  type Placed,
  type Plan,
} from "../src/dragdrop";

const metamodel = Metamodel.compile(essentials.metamodel, essentials.diagramTypes);
const ctx = {
  metamodel,
  actor: { kind: "user" as const, id: "U-DANA" },
  scenario: { id: insuranceGroup.baselineScenarioId, isBaseline: true },
  now: "2026-10-06T12:00:00.000Z",
};

function exampleState(): ModelState {
  const state = new ModelState();
  const result = applyChange(state, insuranceGroup.baselineChange(), ctx);
  if (!result.ok) throw new Error(JSON.stringify(result.reasons));
  return state;
}

let n = 0;
function run(state: ModelState, edits: Edit[]) {
  const result = applyChange(state, { id: `C${++n}`, scenarioId: ctx.scenario.id, label: "t", edits }, ctx);
  if (!result.ok) throw new Error(JSON.stringify(result.reasons));
}
function ok(plan: Plan): Edit[] {
  if ("error" in plan) throw new Error(plan.error);
  return plan.edits;
}
const ids = (state: ModelState, parent: Parameters<typeof childrenOf>[2]) =>
  childrenOf(state, metamodel, parent).map((c) => c.id);
const folder = (id: string) => ({ kind: "folder" as const, id });
const object = (id: string) => ({ kind: "object" as const, id });
const diagram = (id: string) => ({ kind: "diagram" as const, id });

describe("ranks", () => {
  it("makes keys that sort between their neighbours, however often a gap is split", () => {
    let low: string | undefined;
    let high: string | undefined;
    for (let i = 0; i < 200; i++) {
      const mid = rankBetween(low, high);
      if (low !== undefined) expect(mid > low).toBe(true);
      if (high !== undefined) expect(mid < high).toBe(true);
      expect(mid.endsWith("0")).toBe(false);
      if (i % 2) low = mid;
      else high = mid;
    }
  });

  it("ranks only the moved item when its neighbours are ranked, and the unranked ones before the drop point otherwise", () => {
    const a: Placed = { kind: "object", id: "A", name: "A", rank: "a" };
    const c: Placed = { kind: "object", id: "C", name: "C", rank: "c" };
    const moved: Placed = { kind: "object", id: "M", name: "M" };
    const between = rankEdits([a, c], 1, [moved]);
    expect(between).toHaveLength(1);
    const rank = (between[0] as { rank: string }).rank;
    expect(rank > "a" && rank < "c").toBe(true);

    const x: Placed = { kind: "object", id: "X", name: "X" };
    const y: Placed = { kind: "object", id: "Y", name: "Y" };
    const edits = rankEdits([a, x, y], 2, [moved]) as { id: string; rank: string }[];
    expect(edits.map((e) => e.id)).toEqual(["X", "M"]);
    expect(edits[0]!.rank > "a" && edits[1]!.rank > edits[0]!.rank).toBe(true);
  });

  it("ranks the whole list afresh when two siblings share a rank", () => {
    const a: Placed = { kind: "object", id: "A", name: "A", rank: "b" };
    const b: Placed = { kind: "object", id: "B", name: "B", rank: "b" };
    const edits = rankEdits([a, b], 1, [{ kind: "object", id: "M", name: "M" }]) as { id: string; rank: string }[];
    expect(edits.map((e) => e.id)).toEqual(["A", "M", "B"]);
    expect(edits[0]!.rank < edits[1]!.rank && edits[1]!.rank < edits[2]!.rank).toBe(true);
  });

  it("splits a row into before, into and after", () => {
    expect([10, 50, 90].map((y) => dropPosition(y, 100, true))).toEqual(["before", "into", "after"]);
    expect([10, 90].map((y) => dropPosition(y, 100, false))).toEqual(["before", "after"]);
  });
});

describe("drop plans", () => {
  it("reorders top-level folders, and the order holds for everyone (ranks are stored)", () => {
    const state = exampleState();
    expect(ids(state, { kind: "root" })).toEqual(["F04", "F01", "F07", "F06", "F08", "F05"]);
    run(state, ok(dropPlan(state, metamodel, { items: [folder("F05")] }, folder("F04"), "before")));
    expect(ids(state, { kind: "root" })).toEqual(["F05", "F04", "F01", "F07", "F06", "F08"]);
    run(state, ok(dropPlan(state, metamodel, { items: [folder("F04")] }, folder("F06"), "after")));
    expect(ids(state, { kind: "root" })).toEqual(["F05", "F01", "F07", "F06", "F04", "F08"]);
  });

  it("moves a folder, a diagram and an object into a folder, each at the end", () => {
    const state = exampleState();
    run(state, ok(dropPlan(state, metamodel, { items: [diagram("D-01")] }, folder("F04"), "into")));
    run(state, ok(dropPlan(state, metamodel, { items: [folder("F07")] }, folder("F04"), "into")));
    run(state, ok(dropPlan(state, metamodel, { items: [object("O-SRV-1")] }, folder("F04"), "into")));
    expect(ids(state, { kind: "folder", id: "F04" })).toEqual([
      "O-INT-1",
      "O-APP-1",
      "O-APP-2",
      "O-INT-2",
      "O-APP-3",
      "D-01",
      "F07",
      "O-SRV-1",
    ]);
  });

  it("interleaves kinds: a diagram can sit between two objects", () => {
    const state = exampleState();
    run(state, ok(dropPlan(state, metamodel, { items: [diagram("D-01")] }, object("O-APP-2"), "before")));
    expect(ids(state, { kind: "folder", id: "F04" })).toEqual([
      "O-INT-1",
      "O-APP-1",
      "D-01",
      "O-APP-2",
      "O-INT-2",
      "O-APP-3",
    ]);
  });

  it("refuses a folder inside itself, a name clash, a non-folder at the top level and a no-op", () => {
    const state = exampleState();
    const error = (plan: Plan) => ("error" in plan ? plan.error : "");
    expect(error(dropPlan(state, metamodel, { items: [folder("F01")] }, folder("F02"), "into"))).toBe(
      "Business cannot go inside itself",
    );
    run(state, [{ edit: "createFolder", id: "F-X", parentId: "F04", name: "Business" }]);
    expect(error(dropPlan(state, metamodel, { items: [folder("F01")] }, folder("F04"), "into"))).toBe(
      'A folder named "Business" is already in Applications',
    );
    expect(error(dropPlan(state, metamodel, { items: [object("O-APP-1")] }, folder("F01"), "before"))).toBe(
      "Only folders sit at the top level",
    );
    expect(error(dropPlan(state, metamodel, { items: [diagram("D-01")] }, object("O-CAP-1"), "into"))).toBe(
      "Only objects can go inside Claims Management",
    );
    expect(error(dropPlan(state, metamodel, { items: [object("O-APP-1")] }, object("O-APP-2"), "before"))).toBe(
      "It is already there",
    );
  });

  it("puts an object inside another, ordered among its contents, and takes it out by dropping between root rows", () => {
    const state = exampleState();
    run(state, [{ edit: "createObject", id: "O-CAP-9", type: "capability", name: "Fraud", folderId: "F02" }]);
    run(state, ok(dropPlan(state, metamodel, { items: [object("O-CAP-9")] }, object("O-CAP-3"), "before")));
    expect(ids(state, { kind: "object", id: "O-CAP-1" })).toEqual(["O-CAP-2", "O-CAP-9", "O-CAP-3"]);

    run(state, ok(dropPlan(state, metamodel, { items: [object("O-CAP-9")] }, object("O-CAP-1"), "before")));
    expect(ids(state, { kind: "folder", id: "F02" })).toEqual(["O-CAP-9", "O-CAP-1"]);
    expect(ids(state, { kind: "object", id: "O-CAP-1" })).toEqual(["O-CAP-2", "O-CAP-3"]);
  });

  it("adds objects to a group without moving them, and moves a member between groups", () => {
    const state = exampleState();
    run(state, [
      { edit: "createObject", id: "G-1", type: "group", name: "Tooling", folderId: "F04" },
      { edit: "createObject", id: "G-2", type: "group", name: "Legacy", folderId: "F04" },
    ]);
    run(
      state,
      ok(dropPlan(state, metamodel, { items: [object("O-APP-1"), object("O-CAP-1")] }, object("G-1"), "into")),
    );
    expect(groupMembers(state, "G-1").map((m) => m.member.id)).toEqual(["O-CAP-1", "O-APP-1"]);
    expect(state.objects.get("O-CAP-1")!.folderId).toBe("F02");

    const plan = dropPlan(state, metamodel, { items: [object("O-APP-1")] }, object("G-1"), "into");
    expect(plan).toEqual({ error: "Claims Manager is already in Tooling" });

    const membership = groupMembers(state, "G-1").find((m) => m.member.id === "O-APP-1")!.relationship.id;
    const move = dropPlan(
      state,
      metamodel,
      { items: [object("O-APP-1")], memberOf: membership },
      object("G-2"),
      "into",
    );
    expect(move).toMatchObject({ label: "Move Claims Manager from Tooling to Legacy" });
    run(state, ok(move));
    expect(groupMembers(state, "G-1").map((m) => m.member.id)).toEqual(["O-CAP-1"]);
    expect(groupMembers(state, "G-2").map((m) => m.member.id)).toEqual(["O-APP-1"]);
    expect(
      dropPlan(state, metamodel, { items: [object("O-APP-1")], memberOf: membership }, folder("F01"), "into"),
    ).toHaveProperty("error");
  });

  it("offers containment and part types for Alt+drop, and contains with the chosen one", () => {
    const state = exampleState();
    const choices = typeChoices(state, metamodel, "O-CAP-3", "O-CAP-2");
    expect(choices.contain.map((t) => t.key)).toContain("contains");
    const plan = containAsPlan(state, metamodel, "O-CAP-3", "O-CAP-2", "contains");
    expect(plan).toMatchObject({ edits: [{ edit: "reconnectRelationship", id: "R-02", sourceId: "O-CAP-2" }] });
    run(state, ok(plan));
    expect(ids(state, { kind: "object", id: "O-CAP-2" })).toEqual(["O-CAP-3"]);
  });
});
