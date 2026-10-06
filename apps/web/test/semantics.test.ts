import { describe, expect, it } from "vitest";
import { essentials, insuranceGroup } from "@connectome/content";
import { applyChange, Metamodel, ModelState } from "@connectome/engine";
import { containerOf, containPlan, contentsOf, moveToFolderPlan, relationshipGroups } from "../src/semantics";

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
