import { describe, expect, it } from "vitest";
import { essentials, insuranceGroup } from "@connectome/content";
import { applyChange, Metamodel, ModelState, possibleDuplicates, type ApplyContext } from "@connectome/engine";
import type { Edit } from "@connectome/model";
import { notDuplicatesEdits, parseNames, percent } from "../src/duplicates";

const metamodel = Metamodel.compile(essentials.metamodel, essentials.diagramTypes);
const ctx: ApplyContext = {
  metamodel,
  actor: { kind: "user", id: "U-DANA" },
  scenario: { id: insuranceGroup.baselineScenarioId, isBaseline: true },
  now: "2026-10-06T12:00:00.000Z",
};
let n = 0;
const apply = (state: ModelState, edits: Edit[]) => {
  const result = applyChange(state, { id: `C${++n}`, scenarioId: ctx.scenario.id, label: "test", edits }, ctx);
  if (!result.ok) throw new Error(JSON.stringify(result.reasons));
};

describe("possible duplicates in the workbench", () => {
  it("reads other names from a comma-separated list", () => {
    expect(parseNames(" Siebel, CRM ,, crm, Siebel CRM ")).toEqual(["Siebel", "CRM", "Siebel CRM"]);
    expect(parseNames("")).toEqual([]);
  });

  it("records not duplicates on both objects, so the pair is not raised again", () => {
    const state = new ModelState();
    applyChange(state, insuranceGroup.baselineChange(), ctx);
    apply(state, [{ edit: "createObject", id: "A1", type: "application", name: "Claim Manager", folderId: "F04" }]);
    const [pair] = possibleDuplicates(state, metamodel);
    expect(percent(pair!.score)).toMatch(/^\d+%$/);
    apply(state, notDuplicatesEdits(pair!.a, pair!.b));
    expect(possibleDuplicates(state, metamodel)).toEqual([]);
    expect(state.objects.get("A1")!.notDuplicates).toEqual([
      { of: "O-APP-1", name: "Claim Manager", otherName: "Claims Manager" },
    ]);
    // Judging again replaces the old judgement rather than adding a second.
    const a = state.objects.get("A1")!;
    const b = state.objects.get("O-APP-1")!;
    expect(notDuplicatesEdits(a, b)[0]).toMatchObject({ notDuplicates: [{ of: "O-APP-1" }] });
  });
});
