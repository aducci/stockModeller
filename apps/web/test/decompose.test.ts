// Decomposition diagrams (DOC-1b): what is drawn on a diagram about X becomes a part of X, X's parts not yet drawn are
// offered, and the breadcrumb follows the subjects up.
import { describe, expect, it } from "vitest";
import { essentials, insuranceGroup } from "@connectome/content";
import { applyChange, Metamodel, ModelState } from "@connectome/engine";
import type { Edit } from "@connectome/model";
import { IGNORED_PARTS, breadcrumb, missingParts, partEdits, partsOf } from "../src/decompose";
import { diagramAroundPlan } from "../src/views";

const metamodel = Metamodel.compile(essentials.metamodel, essentials.diagramTypes);
const ctx = {
  metamodel,
  actor: { kind: "user" as const, id: "U-DANA" },
  scenario: { id: insuranceGroup.baselineScenarioId, isBaseline: true },
  now: "2026-10-09T12:00:00.000Z",
};
let n = 0;
function run(state: ModelState, edits: Edit[]) {
  const result = applyChange(state, { id: `C${++n}`, scenarioId: ctx.scenario.id, label: "test", edits }, ctx);
  if (!result.ok) throw new Error(JSON.stringify(result.reasons));
}
function exampleState(): ModelState {
  const state = new ModelState();
  run(state, insuranceGroup.baselineChange().edits);
  return state;
}
const valueChain = () => metamodel.diagramType("valueChain")!;

describe("decomposition diagrams", () => {
  it("makes a new value chain about a process, showing the parts it already has, left to right", () => {
    const state = exampleState();
    const plan = diagramAroundPlan(state, metamodel, valueChain(), state.objects.get("O-PRC-2")!, "D-L0");
    run(state, plan.edits);
    expect(state.diagrams.get("D-L0")!.definition).toMatchObject({ subject: "O-PRC-2" });
    const shown = state.objectOccurrences.find("byDiagram", "D-L0").sort((a, b) => a.x - b.x);
    expect(shown.map((o) => state.objects.get(o.objectId)!.name)).toEqual(["Handle Claim", "Recover Costs"]);
    // The line between the parts that the type shows comes with them.
    expect(state.relationshipOccurrences.find("byDiagram", "D-L0").map((l) => l.relationshipId)).toEqual(["R-28"]);
    expect(state.links.find("bySource", "O-PRC-2").map((l) => [l.kind, l.target])).toEqual([
      ["drillDown", { diagramId: "D-08" }],
      ["drillDown", { diagramId: "D-L0" }],
    ]);
  });

  it("makes what is drawn on it a part of its subject, once, and only types the rules allow", () => {
    const state = exampleState();
    const l0 = state.diagrams.get("D-08")!;
    run(state, [{ edit: "createObject", id: "P-NEW", type: "process", name: "Pay Out", folderId: "F03" }]);
    run(state, partEdits(state, metamodel, l0, { id: "P-NEW", type: "process" }).edits);
    expect(partsOf(state, "O-PRC-2", "composedOf").map((p) => p.name)).toEqual([
      "Handle Claim",
      "Recover Costs",
      "Pay Out",
    ]);
    expect(partEdits(state, metamodel, l0, { id: "P-NEW", type: "process" }).edits).toEqual([]);
    // An organisation unit is drawn there but is not a part.
    expect(partEdits(state, metamodel, l0, { id: "O-ORG-1", type: "organisationUnit" }).edits).toEqual([]);
  });

  it("does not take a part from another parent", () => {
    const state = exampleState();
    run(state, [{ edit: "createObject", id: "P-TOP", type: "process", name: "Run Insurance", folderId: "F03" }]);
    const plan = diagramAroundPlan(state, metamodel, valueChain(), state.objects.get("P-TOP")!, "D-TOP");
    run(state, plan.edits);
    const result = partEdits(state, metamodel, state.diagrams.get("D-TOP")!, state.objects.get("O-PRC-1")!);
    expect(result).toEqual({ edits: [], note: expect.stringContaining("already part of Manage Claims") });
  });

  it("offers the parts not drawn yet, until they are ignored", () => {
    const state = exampleState();
    run(state, [
      { edit: "createObject", id: "P-NEW", type: "process", name: "Pay Out", folderId: "F03" },
      { edit: "createRelationship", id: "R-NEW", type: "composedOf", sourceId: "O-PRC-2", targetId: "P-NEW" },
    ]);
    const l0 = () => state.diagrams.get("D-08")!;
    expect(missingParts(state, metamodel, l0()).map((p) => p.name)).toEqual(["Pay Out"]);
    run(state, [
      { edit: "setViewDefinition", diagramId: "D-08", baseVersion: l0().version, set: { [IGNORED_PARTS]: ["P-NEW"] } },
    ]);
    expect(missingParts(state, metamodel, l0())).toEqual([]);
  });

  it("leads back up through the subjects, with each one's decomposition", () => {
    const state = exampleState();
    run(state, [
      { edit: "createObject", id: "P-L2", type: "process", name: "Assess Liability", folderId: "F03" },
      { edit: "createRelationship", id: "R-L2", type: "composedOf", sourceId: "O-PRC-1", targetId: "P-L2" },
    ]);
    const l1 = diagramAroundPlan(state, metamodel, valueChain(), state.objects.get("O-PRC-1")!, "D-L1");
    run(state, l1.edits);
    const l2 = diagramAroundPlan(state, metamodel, valueChain(), state.objects.get("P-L2")!, "D-L2");
    run(state, l2.edits);
    expect(breadcrumb(state, metamodel, state.diagrams.get("D-L2")!).map((c) => [c.object.name, c.diagramId])).toEqual([
      ["Manage Claims", "D-08"],
      ["Handle Claim", "D-L1"],
      ["Assess Liability", undefined],
    ]);
    // The top of the tree has no way up, so no breadcrumb.
    expect(breadcrumb(state, metamodel, state.diagrams.get("D-08")!)).toEqual([]);
  });
});
