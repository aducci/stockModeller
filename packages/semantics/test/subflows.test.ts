// A connection's sub-flows (slice DOC-2): what a conceptual line between two systems stands for.
import { describe, expect, it } from "vitest";
import { essentials, insuranceGroup } from "@connectome/content";
import { applyChange, Metamodel, ModelState } from "@connectome/engine";
import type { Edit } from "@connectome/model";
import { scopeOf, subFlows } from "../src";

const metamodel = Metamodel.compile(essentials.metamodel, essentials.diagramTypes);
const context = {
  metamodel,
  actor: { kind: "user" as const, id: "U-DANA" },
  scenario: { id: insuranceGroup.baselineScenarioId, isBaseline: true },
  now: "2026-10-09T12:00:00.000Z",
};
let n = 0;
function exampleState(edits: Edit[] = []) {
  const state = new ModelState();
  for (const batch of [insuranceGroup.baselineChange().edits, edits]) {
    if (batch.length === 0) continue;
    const result = applyChange(
      state,
      { id: `C${++n}`, label: "t", scenarioId: context.scenario.id, edits: batch },
      context,
    );
    if (!result.ok) throw new Error(JSON.stringify(result.reasons));
  }
  return state;
}
const options = { property: "integration.informationFlows", exclude: "integration.excludedFlows" };

describe("sub-flows", () => {
  it("reach what an element realises, is composed of or contains", () => {
    const state = exampleState();
    expect([...scopeOf(state, metamodel, "O-APP-3").keys()].sort()).toEqual(["O-APP-3", "O-CAP-3", "O-INT-2"]);
  });

  it("imply the more concrete flows between the scopes of a conceptual connection's ends", () => {
    const state = exampleState();
    const sub = subFlows(state, metamodel, "R-08", options);
    expect(sub.implied.map((i) => i.relationship.id)).toEqual(["R-16"]);
    expect(sub.impliedElements.map((e) => [e.object.name, e.through.id])).toEqual([["Pay a claim", "R-16"]]);
    // A connection that does not say how abstract it is implies nothing.
    expect(subFlows(state, metamodel, "R-09", options).implied).toEqual([]);
    // The call is as concrete as what it could imply, so it implies nothing either.
    expect(subFlows(state, metamodel, "R-16", options)).toMatchObject({
      explicit: [{ id: "O-FN-1" }],
      implied: [],
    });
  });

  it("follow composition into an application's parts, and leave out what is excluded", () => {
    const state = exampleState([
      { edit: "createObject", id: "A-PART", type: "application", name: "Claims Payments", folderId: "F04" },
      { edit: "createRelationship", id: "R-PART", type: "composedOf", sourceId: "O-APP-1", targetId: "A-PART" },
      { edit: "createRelationship", id: "R-CALL", type: "calls", sourceId: "A-PART", targetId: "O-INT-2" },
      {
        edit: "setRelationshipProperties",
        id: "R-08",
        baseVersion: 1,
        set: { "integration.excludedFlows": ["O-FN-1"] },
      },
    ]);
    const sub = subFlows(state, metamodel, "R-08", options);
    expect(sub.implied.map((i) => [i.relationship.id, i.via.map((r) => r.id)])).toEqual([
      ["R-16", ["R-15"]],
      ["R-CALL", ["R-PART", "R-15"]],
    ]);
    expect(sub.impliedElements).toEqual([]);
    expect(sub.excluded).toEqual(["O-FN-1"]);
  });
});
