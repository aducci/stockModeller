// The connection framework's examples (design/01-product/connection_framework.md §6 and §14) answered by traces.
import { describe, expect, it } from "vitest";
import { essentials, insuranceGroup } from "@connectome/content";
import { applyChange, Metamodel, ModelState } from "@connectome/engine";
import type { Edit } from "@connectome/model";
import { trace, traceByAbstraction, type Trace } from "../src";

const metamodel = Metamodel.compile(essentials.metamodel, essentials.diagramTypes);
const context = {
  metamodel,
  actor: { kind: "user" as const, id: "U-DANA" },
  scenario: { id: insuranceGroup.baselineScenarioId, isBaseline: true },
  now: "2026-10-06T12:00:00.000Z",
};
const state = new ModelState();
const run = (edits: Edit[]) => {
  const result = applyChange(
    state,
    { id: `C${edits.length}`, label: "fixture", scenarioId: context.scenario.id, edits },
    context,
  );
  if (!result.ok) throw new Error(JSON.stringify(result.reasons));
};
run(insuranceGroup.baselineChange().edits);
const abstraction = (l: string) => ({ "semantic.abstraction": l });
run([
  // Payment Information and its representation chain (§6).
  {
    edit: "createObject",
    id: "D-PI",
    type: "dataObject",
    name: "Payment Information",
    folderId: "F04",
    properties: abstraction("conceptual"),
  },
  {
    edit: "createObject",
    id: "D-PLM",
    type: "dataObject",
    name: "Payment Logical Model",
    folderId: "F04",
    properties: abstraction("logical"),
  },
  {
    edit: "createObject",
    id: "D-JSON",
    type: "dataObject",
    name: "Payment JSON",
    folderId: "F04",
    properties: abstraction("physical"),
  },
  {
    edit: "createObject",
    id: "D-REC",
    type: "dataObject",
    name: "Payment DB Record",
    folderId: "F04",
    properties: abstraction("physical"),
  },
  { edit: "createRelationship", id: "X-1", type: "represents", sourceId: "D-PLM", targetId: "D-PI" },
  { edit: "createRelationship", id: "X-2", type: "represents", sourceId: "D-JSON", targetId: "D-PLM" },
  { edit: "createRelationship", id: "X-3", type: "represents", sourceId: "D-REC", targetId: "D-PLM" },
  { edit: "setPayload", id: "R-08", baseVersion: 1, payload: ["D-JSON"] },
  // A logical service, implemented by the example's Payments API (which Payments Hub provides and Claims Manager
  // calls, with a request out and a response back).
  {
    edit: "createObject",
    id: "S-PAY",
    type: "service",
    name: "Payment Service",
    folderId: "F04",
    properties: abstraction("logical"),
  },
  { edit: "setProperties", id: "O-INT-2", baseVersion: 1, set: abstraction("physical") },
  { edit: "createRelationship", id: "X-4", type: "realizes", sourceId: "O-INT-2", targetId: "S-PAY" },
  { edit: "createRelationship", id: "X-6", type: "serves", sourceId: "S-PAY", targetId: "O-PRC-1" },
]);

const names = (t: Trace, depth?: number) =>
  t.steps.filter((s) => depth === undefined || s.depth === depth).map((s) => state.objects.get(s.objectId)!.name);

describe("traces (semantics.md §9.3)", () => {
  it("what uses this service?", () => {
    expect(names(trace(state, metamodel, "S-PAY", "dependency", "backward"))).toEqual(["Handle Claim"]);
  });

  it("what flows into this application?", () => {
    const upstream = trace(state, metamodel, "O-APP-3", "flow", "backward");
    expect(names(upstream, 1)).toEqual(["Claims Manager"]);
    expect(names(upstream, 2)).toEqual(["Legacy CRM", "Payments API"]); // the response message is a flow too
  });

  it("what systems consume this information, through its representations?", () => {
    const consumers = trace(state, metamodel, "D-PI", "payload", "forward");
    expect(names(consumers)).toEqual(["Payments Hub"]);
    expect(consumers.steps[0]).toMatchObject({ relationshipId: "R-08", fromId: "D-JSON" });
    // What flows are affected if it changes, and who sends them.
    expect(names(trace(state, metamodel, "D-PI", "payload", "backward"))).toEqual(["Claims Manager"]);
  });

  it("what physical interfaces implement this logical service? (down the abstractions, in columns)", () => {
    const down = trace(state, metamodel, "S-PAY", "abstraction", "forward");
    expect(traceByAbstraction(state, metamodel, down).map((c) => [c.abstraction, c.objectIds])).toEqual([
      ["physical", ["O-INT-2"]],
      ["implementation", ["O-APP-3"]],
    ]);
  });

  it("traces information to its representations and back", () => {
    expect(names(trace(state, metamodel, "D-PI", "abstraction", "forward"))).toEqual([
      "Payment Logical Model",
      "Payment JSON",
      "Payment DB Record",
    ]);
    expect(names(trace(state, metamodel, "D-JSON", "abstraction", "backward"))).toEqual([
      "Payment Logical Model",
      "Payment Information",
    ]);
  });

  it("what this depends on: providers, called interfaces, what feeds it and the information it accesses", () => {
    expect(names(trace(state, metamodel, "O-APP-1", "dependency", "forward", { depth: 1 }))).toEqual([
      "Legacy CRM",
      "Payments API",
      "Claim",
    ]);
  });

  it("counts a container's flows as its contents' when asked", () => {
    run([
      { edit: "createObject", id: "O-SUITE", type: "application", name: "Claims Suite", folderId: "F04" },
      { edit: "createRelationship", id: "X-10", type: "contains", sourceId: "O-SUITE", targetId: "O-APP-1" },
    ]);
    expect(names(trace(state, metamodel, "O-SUITE", "flow", "forward"))).toEqual([]);
    expect(names(trace(state, metamodel, "O-SUITE", "flow", "forward", { contents: true, depth: 1 }))).toEqual([
      "Payments Hub",
      "Payments API",
    ]);
    expect(trace(state, metamodel, "O-SUITE", "flow", "forward", { contents: true, limit: 1 }).truncated).toBe(true);
  });

  it("reads a reverse type the right way round", () => {
    const mm = Metamodel.compile({
      name: "Reverse",
      version: "1.0.0",
      objectTypes: [{ key: "thing", name: "Thing", properties: [] }],
      relationshipTypes: [
        {
          key: "realisedBy",
          name: "Realised by",
          verb: "is realised by",
          inverseVerb: "realises",
          semantic: "realisation",
          semanticDirection: "reverse",
        },
      ],
      relationshipRules: [{ relationshipType: "realisedBy", sourceType: "thing", targetType: "thing" }],
    });
    const local = new ModelState();
    applyChange(
      local,
      {
        id: "C-R",
        label: "fixture",
        scenarioId: context.scenario.id,
        edits: [
          { edit: "createFolder", id: "F", parentId: null, name: "F" },
          { edit: "createObject", id: "A", type: "thing", name: "Abstract", folderId: "F" },
          { edit: "createObject", id: "C", type: "thing", name: "Concrete", folderId: "F" },
          { edit: "createRelationship", id: "AC", type: "realisedBy", sourceId: "A", targetId: "C" },
        ],
      },
      { ...context, metamodel: mm },
    );
    expect(trace(local, mm, "A", "abstraction", "forward").steps.map((s) => s.objectId)).toEqual(["C"]);
    expect(trace(local, mm, "C", "abstraction", "backward").steps.map((s) => s.objectId)).toEqual(["A"]);
  });
});
