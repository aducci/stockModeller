import { describe, expect, it } from "vitest";
import { essentials, insuranceGroup } from "@connectome/content";
import { applyChange, Metamodel, ModelState } from "@connectome/engine";
import {
  addPayloadPlan,
  containerOf,
  containPlan,
  contentsOf,
  messagePlan,
  messagesOf,
  moveToFolderPlan,
  payloadChoices,
  payloadText,
  relationshipGroups,
} from "../src/semantics";

const metamodel = Metamodel.compile(essentials.metamodel, essentials.diagramTypes);
const state = new ModelState();
applyChange(state, insuranceGroup.baselineChange(), {
  metamodel,
  actor: { kind: "user", id: "U-DANA" },
  scenario: { id: insuranceGroup.baselineScenarioId, isBaseline: true },
  now: "2026-10-06T12:00:00.000Z",
});

describe("relationship groups", () => {
  it("groups Claims Manager's relationships by kind, in the kinds' order", () => {
    const groups = relationshipGroups(state, metamodel, "O-APP-1");
    expect(
      groups.map((g) => [g.label, g.rows.map((r) => `${r.verb} ${r.arrow} ${state.objects.get(r.other)!.name}`)]),
    ).toEqual([
      ["What this implements", ["realizes → Claim Intake"]],
      ["Consumers", ["serves → Handle Claim"]],
      ["Performed by", ["is hosted on → SRV-APP-01"]],
      ["Downstream", ["flows to → Payments Hub"]],
      ["Upstream", ["receives from ← Legacy CRM"]],
    ]);
  });

  it("reads a hierarchy from both ends", () => {
    expect(relationshipGroups(state, metamodel, "O-CAP-1").map((g) => g.label)).toEqual(["Contents"]);
    expect(relationshipGroups(state, metamodel, "O-CAP-2").map((g) => g.label)).toEqual([
      "Container",
      "Implementations",
    ]);
  });
});

describe("containment plans", () => {
  it("contains through the allowed containment type, or re-parents the same relationship", () => {
    expect(containPlan(state, metamodel, "O-STP-1", "O-PRC-1")).toEqual({
      error: "Assess Claim is already in Handle Claim",
    });
    const reparent = containPlan(state, metamodel, "O-CAP-3", "O-CAP-2");
    expect(reparent).toMatchObject({
      label: "Put Claim Settlement in Claim Intake",
      edits: [{ edit: "reconnectRelationship", id: "R-02", sourceId: "O-CAP-2" }],
    });
    expect(containPlan(state, metamodel, "O-SRV-1", "O-CAP-1")).toEqual({
      error: "No containment rule lets a Server sit inside a Capability",
    });
    expect(containPlan(state, metamodel, "O-CAP-1", "O-CAP-2")).toEqual({
      error: "Claim Intake is already inside Claims Management",
    });
    expect(containPlan(state, metamodel, "O-APP-3", "O-APP-1")).toMatchObject({
      edits: [{ edit: "createRelationship", type: "contains", sourceId: "O-APP-1", targetId: "O-APP-3" }],
    });
  });

  it("takes a content out of its container when it is dropped on a folder", () => {
    expect(moveToFolderPlan(state, metamodel, "O-CAP-2", "F02")).toMatchObject({
      label: "Take Claim Intake out of Claims Management",
      edits: [{ edit: "deleteRelationship", id: "R-01" }],
    });
    expect(moveToFolderPlan(state, metamodel, "O-CAP-2", "F05")).toMatchObject({
      edits: [{ edit: "deleteRelationship" }, { edit: "moveToFolder", folderId: "F05" }],
    });
    expect(containerOf(state, metamodel, "O-CAP-1")).toBeUndefined();
    expect(contentsOf(state, metamodel, "O-CAP-1").map((o) => o.name)).toEqual(["Claim Intake", "Claim Settlement"]);
  });
});

describe("payloads and messages", () => {
  const local = state.clone();
  applyChange(
    local,
    {
      id: "C-PAY",
      label: "Payments",
      scenarioId: insuranceGroup.baselineScenarioId,
      edits: [
        { edit: "createObject", id: "D-PAY", type: "dataObject", name: "Payment Information", folderId: "F04" },
        { edit: "createObject", id: "I-API", type: "interface", name: "Payments API", folderId: "F04" },
        { edit: "createRelationship", id: "C1", type: "calls", sourceId: "O-APP-1", targetId: "I-API" },
        {
          edit: "createRelationship",
          id: "M1",
          type: "flowsTo",
          sourceId: "O-APP-1",
          targetId: "I-API",
          parentId: "C1",
        },
        { edit: "setPayload", id: "R-08", baseVersion: 1, payload: ["D-PAY"] },
      ],
    },
    {
      metamodel,
      actor: { kind: "user", id: "U-DANA" },
      scenario: { id: insuranceGroup.baselineScenarioId, isBaseline: true },
    },
  );

  it("adds to a flow's payload, offering information first, and refuses types without one", () => {
    expect(payloadText(local, local.relationships.get("R-08")!)).toBe("Payment Information");
    expect(addPayloadPlan(local, metamodel, "R-08", "D-PAY")).toEqual({
      error: "It already carries Payment Information",
    });
    expect(addPayloadPlan(local, metamodel, "R-05", "D-PAY")).toEqual({ error: "Realizes carries no payload" });
    expect(addPayloadPlan(local, metamodel, "R-09", "D-PAY")).toMatchObject({
      label: "Carry Payment Information",
      edits: [{ edit: "setPayload", id: "R-09", payload: ["D-PAY"] }],
    });
    expect(payloadChoices(local, metamodel, local.relationships.get("R-09")!)[0]!.name).toBe("Payment Information");
  });

  it("lists an interaction's messages under it, with requests and responses", () => {
    const calls = relationshipGroups(local, metamodel, "O-APP-1").find((g) => g.kind === "interaction")!;
    expect(calls.rows.map((r) => r.relationship.id)).toEqual(["C1"]);
    expect(
      relationshipGroups(local, metamodel, "O-APP-1").flatMap((g) => g.rows.map((r) => r.relationship.id)),
    ).not.toContain("M1");
    expect(messagesOf(local, local.relationships.get("C1")!).map((m) => m.role)).toEqual(["request"]);
    expect(messagePlan(local, metamodel, "C1", "response", "M2")).toEqual({
      label: "Add a response from Payments API to Claims Manager",
      edits: [
        {
          edit: "createRelationship",
          id: "M2",
          type: "flowsTo",
          sourceId: "I-API",
          targetId: "O-APP-1",
          parentId: "C1",
        },
      ],
    });
  });
});
