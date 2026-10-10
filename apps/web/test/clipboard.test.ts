import { describe, expect, it } from "vitest";
import { essentials, insuranceGroup } from "@connectome/content";
import { applyChange, Metamodel, ModelState } from "@connectome/engine";
import { clipOrigin, copySymbols, pasteEdits } from "../src/clipboard";

const metamodel = Metamodel.compile(essentials.metamodel, essentials.diagramTypes);
const ctx = {
  metamodel,
  actor: { kind: "user" as const, id: "U-DANA" },
  scenario: { id: insuranceGroup.baselineScenarioId, isBaseline: true },
  now: "2026-10-10T12:00:00.000Z",
};

function exampleState(): ModelState {
  const state = new ModelState();
  const result = applyChange(state, insuranceGroup.baselineChange(), ctx);
  if (!result.ok) throw new Error(JSON.stringify(result.reasons));
  return state;
}

const ids = () => {
  let n = 0;
  return () => `NEW-${++n}`;
};

describe("copy and paste on a canvas", () => {
  it("copies a nested symbol with its parent, keeping its place inside, and the lines between them", () => {
    const state = exampleState();
    const clip = copySymbols(state, "D-01", ["OO-1", "OO-2"]);
    expect(clip.symbols.map((s) => [s.key, s.parentKey])).toEqual([
      ["OO-1", null],
      ["OO-2", "OO-1"],
    ]);
    expect(clip.symbols[1]).toMatchObject({ x: 16, y: 36 });
    expect(clip.lines.every((l) => l.sourceKey === "OO-1" && l.targetKey === "OO-2")).toBe(true);
  });

  it("pastes occurrences of the same objects, never copies, and applies as one change", () => {
    const state = exampleState();
    const objectsBefore = state.objects.size;
    const clip = copySymbols(state, "D-01", ["OO-4", "OO-5"]);
    const origin = clipOrigin(clip);
    const { edits, occIds } = pasteEdits(state, clip, "D-01", { x: origin.x + 16, y: origin.y + 16 }, 9, ids());
    expect(occIds).toEqual(["NEW-1", "NEW-2"]);
    // OO-4 → OO-5 is drawn on D-01, so the pasted pair is joined by the same relationship.
    expect(edits.filter((e) => e.edit === "addRelationshipOccurrence")).toHaveLength(1);
    const result = applyChange(state, { id: "C-PASTE", scenarioId: ctx.scenario.id, label: "Paste", edits }, ctx);
    expect(result.ok).toBe(true);
    expect(state.objects.size).toBe(objectsBefore);
    expect(state.objectOccurrences.get("NEW-1")).toMatchObject({ objectId: "O-APP-1", x: 80, y: 128 });
  });

  it("lands a symbol whose parent was not copied at its place on the diagram", () => {
    const state = exampleState();
    const clip = copySymbols(state, "D-01", ["OO-2"]);
    expect(clip.symbols[0]).toMatchObject({ parentKey: null, x: 36, y: 56 });
  });
});
