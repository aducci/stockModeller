// The sequence projection (views-and-design-artifacts.md §6) over the example repository.
import { describe, expect, it } from "vitest";
import { essentials, insuranceGroup } from "@connectome/content";
import { applyChange, Metamodel, ModelState } from "@connectome/engine";
import type { Edit } from "@connectome/model";
import { projectSequence, undrawnMessages } from "../src";

const metamodel = Metamodel.compile(essentials.metamodel, essentials.diagramTypes);
let n = 0;
function apply(state: ModelState, edits: Edit[]) {
  const change = { id: `C-${++n}`, scenarioId: insuranceGroup.baselineScenarioId, label: "test", edits };
  const result = applyChange(state, change, {
    metamodel,
    actor: { kind: "user", id: "U-DANA" },
    scenario: { id: insuranceGroup.baselineScenarioId, isBaseline: true },
    now: "2026-10-07T12:00:00.000Z",
  });
  if (!result.ok) throw new Error(JSON.stringify(result.reasons));
}
const lifeline = (id: string, objectId: string, x: number) => ({
  id,
  objectId,
  parentOccurrenceId: null,
  x,
  y: 0,
  w: 120,
  h: 40,
  z: 0,
  style: {},
  drillDownDiagramId: null,
  pinned: false,
});
const message = (id: string, relationshipId: string, from: string, to: string, step?: string) => ({
  id,
  relationshipId,
  sourceOccurrenceId: from,
  targetOccurrenceId: to,
  shownAs: "line" as const,
  route: { mode: "auto" as const },
  labelPosition: 0.5,
  style: {},
  ...(step ? { step } : {}),
});

/** Claims Manager calls the Payments API: "Pay claim" carrying Claim Settlement, then "Paid" back. */
function example() {
  const state = new ModelState();
  apply(state, insuranceGroup.baselineChange().edits);
  apply(state, [
    { edit: "createObject", id: "O-IF-1", type: "interface", name: "Payments API", folderId: "F04" },
    { edit: "createRelationship", id: "I-1", type: "calls", sourceId: "O-APP-1", targetId: "O-IF-1" },
    {
      edit: "createRelationship",
      id: "M-REQ",
      type: "flowsTo",
      sourceId: "O-APP-1",
      targetId: "O-IF-1",
      parentId: "I-1",
      name: "Pay claim",
      payload: ["O-CAP-3"],
    },
    {
      edit: "createRelationship",
      id: "M-RES",
      type: "flowsTo",
      sourceId: "O-IF-1",
      targetId: "O-APP-1",
      parentId: "I-1",
      name: "Paid",
    },
    { edit: "createDiagram", id: "D-SEQ", name: "Pay a claim", diagramType: "sequence", folderId: "F06" },
    { edit: "addObjectOccurrence", diagramId: "D-SEQ", occurrence: lifeline("L-PH", "O-IF-1", 400) },
    { edit: "addObjectOccurrence", diagramId: "D-SEQ", occurrence: lifeline("L-CM", "O-APP-1", 100) },
  ]);
  return state;
}

describe("sequences", () => {
  it("draw lifelines left to right, messages in step order, and an activation from request to response", () => {
    const state = example();
    apply(state, [
      {
        edit: "addRelationshipOccurrence",
        diagramId: "D-SEQ",
        occurrence: message("S-2", "M-RES", "L-PH", "L-CM", "b"),
      },
      {
        edit: "addRelationshipOccurrence",
        diagramId: "D-SEQ",
        occurrence: message("S-1", "M-REQ", "L-CM", "L-PH", "a"),
      },
    ]);
    const seq = projectSequence(state, metamodel, "D-SEQ");
    expect(seq.lifelines.map((l) => l.object?.name)).toEqual(["Claims Manager", "Payments API"]);
    expect(seq.messages.map((m) => [m.number, m.relationship.name, m.role, m.from, m.to])).toEqual([
      [1, "Pay claim", "request", 0, 1],
      [2, "Paid", "response", 1, 0],
    ]);
    expect(seq.messages[0]!.payload.map((o) => o.name)).toEqual(["Claim Settlement"]);
    expect(seq.activations).toEqual([{ lane: 1, from: 0, to: 1, depth: 0 }]);
  });

  it("move a message by its step only, and treat asynchronous requests as open-headed with no activation", () => {
    const state = example();
    apply(state, [
      {
        edit: "addRelationshipOccurrence",
        diagramId: "D-SEQ",
        occurrence: message("S-1", "M-REQ", "L-CM", "L-PH", "a"),
      },
      {
        edit: "addRelationshipOccurrence",
        diagramId: "D-SEQ",
        occurrence: message("S-2", "M-RES", "L-PH", "L-CM", "b"),
      },
      { edit: "setMessageStep", diagramId: "D-SEQ", occurrenceId: "S-2", step: "0" },
      {
        edit: "setRelationshipProperties",
        id: "I-1",
        baseVersion: state.relationships.get("I-1")!.version,
        set: { "interaction.pattern": "asynchronous" },
      },
    ]);
    const seq = projectSequence(state, metamodel, "D-SEQ");
    expect(seq.messages.map((m) => m.relationship.name)).toEqual(["Paid", "Pay claim"]);
    expect(seq.messages[1]!.synchronous).toBe(false);
    expect(seq.activations).toEqual([]);
  });

  it("list the messages of interactions between lifelines that are not drawn yet, in message order", () => {
    const state = example();
    expect(undrawnMessages(state, "D-SEQ", ["O-APP-1", "O-IF-1"]).map((r) => r.id)).toEqual(["M-REQ", "M-RES"]);
    apply(state, [
      { edit: "addRelationshipOccurrence", diagramId: "D-SEQ", occurrence: message("S-1", "M-REQ", "L-CM", "L-PH") },
    ]);
    expect(undrawnMessages(state, "D-SEQ", ["O-APP-1", "O-IF-1"]).map((r) => r.id)).toEqual(["M-RES"]);
  });
});
