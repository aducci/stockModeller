// A document's register (DOC-3): a new item about the subject, in the type's default folder with its defaults, and
// a name made from a selection of prose.
import { describe, expect, it } from "vitest";
import { essentials, insuranceGroup } from "@connectome/content";
import { applyChange, Metamodel, ModelState } from "@connectome/engine";
import type { Edit } from "@connectome/model";
import { projectDocument } from "@connectome/views";
import { addItemPlan, defaultsFor, itemName, registerAddOf } from "../src/raid";

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

describe("RAID items from a document", () => {
  it("finds what the high-level design's register adds", () => {
    const state = exampleState();
    const d = state.diagrams.get("D-04")!;
    const doc = projectDocument(state, metamodel, metamodel.diagramType("hld")!.definition, d.definition);
    expect(registerAddOf(doc)).toEqual({
      title: "RAID",
      types: ["risk", "assumption", "issue", "dependency"],
      relationship: "concerns",
    });
  });

  it("adds an open item about the subject in the RAID folder, in one change", () => {
    const state = exampleState();
    const subject = state.objects.get("O-APP-1")!;
    expect(defaultsFor(metamodel, "risk")).toEqual({ "raid.status": "open" });
    const plan = addItemPlan(
      state,
      metamodel,
      "concerns",
      "risk",
      "  Vendor\nlock-in ",
      subject,
      subject,
      "O-N",
      "R-N",
    );
    expect(plan.label).toBe("Add risk Vendor lock-in");
    run(state, plan.edits);
    expect(state.objects.get("O-N")).toMatchObject({
      name: "Vendor lock-in",
      folderId: "F10",
      properties: { "raid.status": "open" },
    });
    expect(state.relationships.get("R-N")).toMatchObject({ type: "concerns", sourceId: "O-N", targetId: "O-APP-1" });
    // Without a subject the item is only created.
    expect(addItemPlan(state, metamodel, "concerns", "issue", "X", undefined, subject).edits).toHaveLength(1);
  });

  it("names an item after a selection, on one line and cut at a word", () => {
    expect(itemName("The nightly\n  feed has no retry. ")).toBe("The nightly feed has no retry.");
    const long = itemName("word ".repeat(60));
    expect(long.length).toBeLessThanOrEqual(200);
    expect(long.endsWith("word…")).toBe(true);
  });
});
