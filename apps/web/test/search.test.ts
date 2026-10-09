import { describe, expect, it } from "vitest";
import { essentials, insuranceGroup } from "@connectome/content";
import { applyChange, Metamodel, ModelState } from "@connectome/engine";
import { NEAR_LIMIT, search } from "../src/search";

const metamodel = Metamodel.compile(essentials.metamodel, essentials.diagramTypes);
const state = new ModelState();
applyChange(state, insuranceGroup.baselineChange(), {
  metamodel,
  actor: { kind: "user", id: "U-DANA" },
  scenario: { id: insuranceGroup.baselineScenarioId, isBaseline: true },
  now: "2026-10-09T12:00:00.000Z",
});
const names = (found: { name: string }[]) => found.map((f) => f.name);
const any = () => true;

describe("search instead of lists", () => {
  it("ranks the start of the name, then the start of a word, then anywhere, ignoring case and accents", () => {
    expect(names(search(state, metamodel, "cla", { objects: any }))).toEqual([
      "Claim",
      "Claim Intake",
      "Claim Settlement",
      "Claims API",
      "Claims department",
      "Claims Management",
      "Claims Manager",
      "Assess Claim",
      "Handle Claim",
      "Manage Claims",
      "Pay a claim",
      "Pay Claim",
    ]);
    expect(names(search(state, metamodel, "ÉNT", { objects: any }))).toEqual([
      "Claim Settlement",
      "Claims department",
      "Claims Management",
      "Payment",
      "Payments API",
      "Payments Hub",
    ]);
  });

  it("puts neighbours first, and offers only a few of them before anything is typed", () => {
    expect(names(search(state, metamodel, "pay", { objects: any, nearFolderId: "F08" }))).toEqual([
      "Payment",
      "Pay a claim",
      "Pay Claim",
      "Payments API",
      "Payments Hub",
    ]);
    expect(names(search(state, metamodel, "", { objects: any, diagrams: any, nearFolderId: "F04" }))).toEqual([
      "Claims API",
      "Claims Manager",
      "Legacy CRM",
      "Pay a claim",
      "Payments API",
      "Payments Hub",
    ]);
    const ctx = {
      metamodel,
      actor: { kind: "user" as const, id: "U-DANA" },
      scenario: { id: insuranceGroup.baselineScenarioId, isBaseline: true },
      now: "2026-10-09T12:00:00.000Z",
    };
    const crowded = new ModelState();
    applyChange(crowded, insuranceGroup.baselineChange(), ctx);
    applyChange(
      crowded,
      {
        id: "C-MANY",
        scenarioId: insuranceGroup.baselineScenarioId,
        label: "Many",
        edits: Array.from({ length: 12 }, (_, i) => ({
          edit: "createObject" as const,
          id: `O-N-${i}`,
          type: "application",
          name: `App ${i}`,
          folderId: "F04",
        })),
      },
      ctx,
    );
    expect(search(crowded, metamodel, "", { objects: any, nearFolderId: "F04" })).toHaveLength(NEAR_LIMIT);
    expect(search(state, metamodel, "", { objects: any })).toEqual([]);
  });

  it("keeps to the scope, says what and where each match is, and shows at most the limit", () => {
    const found = search(state, metamodel, "context", { diagrams: (d) => d.diagramType === "context" });
    expect(found.map((f) => [f.kind, f.name, f.what, f.where])).toEqual([
      ["diagram", "Claims Manager context", "Context diagram", "Diagrams / Designs"],
      ["diagram", "Payments API context", "Context diagram", "Diagrams / Designs"],
    ]);
    expect(search(state, metamodel, "a", { objects: any, limit: 3 })).toHaveLength(3);
    expect(search(state, metamodel, "claims", { objects: (o) => o.type === "interface" })).toHaveLength(1);
  });
});
