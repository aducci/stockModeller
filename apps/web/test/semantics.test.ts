import { describe, expect, it } from "vitest";
import { essentials, insuranceGroup } from "@connectome/content";
import { applyChange, Metamodel, ModelState } from "@connectome/engine";
import { relationshipGroups } from "../src/semantics";

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
