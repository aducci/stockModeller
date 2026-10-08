import { describe, expect, it } from "vitest";
import { essentials, insuranceGroup } from "@connectome/content";
import { applyChange, Metamodel, ModelState } from "@connectome/engine";
import { existingRepeats, identityChanges, objectIdentityWords, setIdentityField } from "../src/identity-admin";
import type { Draft } from "../src/property-admin";

const metamodel = Metamodel.compile(essentials.metamodel, essentials.diagramTypes);
const draft: Draft = { package: essentials.metamodel, diagramTypes: essentials.diagramTypes };
const compile = (d: Draft) => Metamodel.compile(d.package, d.diagramTypes);

describe("duplicates settings", () => {
  it("describes a type's name policy, inheritance included", () => {
    expect(objectIdentityWords(metamodel, "application")).toBe("Unique in the repository, with related types, refused");
    expect(objectIdentityWords(metamodel, "processStep")).toBe("Unique in its container, refused");
    expect(objectIdentityWords(metamodel, "dataObject")).toBe("Unique in the repository, warned");
    expect(objectIdentityWords(metamodel, "server")).toBe("May repeat");
  });

  it("lists the types a draft changes, and clears a field back to the inherited value", () => {
    const strict = setIdentityField(draft, "object", "dataObject", "onClash", "block");
    const flows = setIdentityField(strict, "relationship", "flowsTo", "distinct", "none");
    expect(identityChanges(metamodel, compile(flows))).toEqual([
      { kind: "object", type: "dataObject", now: "Unique in the repository, refused" },
      { kind: "relationship", type: "flowsTo", now: "Any number" },
    ]);
    // A subtype that inherits a change is listed too.
    const loose = setIdentityField(draft, "object", "applicationBase", "uniqueAcross", undefined);
    expect(identityChanges(metamodel, compile(loose)).map((c) => c.type)).toEqual([
      "applicationBase",
      "application",
      "saasApplication",
    ]);
  });

  it("counts the names that already repeat under a new policy", () => {
    const state = new ModelState();
    applyChange(state, insuranceGroup.baselineChange(), {
      metamodel,
      actor: { kind: "user", id: "U-DANA" },
      scenario: { id: insuranceGroup.baselineScenarioId, isBaseline: true },
      now: "2026-10-06T12:00:00.000Z",
    });
    expect(existingRepeats(state, metamodel, "dataObject")).toBe(0);
    // Data objects only warn, so a second "Payment" is saved; both now repeat a name.
    applyChange(
      state,
      {
        id: "C2",
        scenarioId: insuranceGroup.baselineScenarioId,
        label: "test",
        edits: [{ edit: "createObject", id: "N1", type: "dataObject", name: "Payment", folderId: "F08" }],
      },
      {
        metamodel,
        actor: { kind: "user", id: "U-DANA" },
        scenario: { id: insuranceGroup.baselineScenarioId, isBaseline: true },
      },
    );
    expect(existingRepeats(state, metamodel, "dataObject")).toBe(2);
  });
});
