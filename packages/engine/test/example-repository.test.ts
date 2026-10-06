import { describe, expect, it } from "vitest";
import { applyChange, invertLog } from "../src";
import {
  BASELINE,
  TARGET_2027,
  context,
  example,
  exampleBaselineChange,
  exampleScenarioChange,
  exampleState,
  snapshot,
} from "./fixtures";
import { ModelState } from "../src";

describe("the design pack's example repository", () => {
  it("loads as one valid change", () => {
    const state = new ModelState();
    const result = applyChange(state, exampleBaselineChange(), context());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect([...state.objects.live()]).toHaveLength(example.objects.length);
    expect([...state.relationships.live()]).toHaveLength(example.relationships.length);
    expect(result.log).toHaveLength(exampleBaselineChange().edits.length);
    expect(result.versions["O-APP-1"]).toBe(1);
  });

  it("flags nothing: every relationship matches a blocking rule", () => {
    const result = applyChange(new ModelState(), exampleBaselineChange(), context());
    expect(result.ok && result.findings).toEqual([]);
  });

  it("shows Claims Manager twice on one diagram, both occurrences pointing to the one object", () => {
    const state = exampleState();
    const occurrences = state.objectOccurrences.find("byObject", "O-APP-1");
    expect(occurrences.map((o) => o.id).sort()).toEqual(["OO-4", "OO-6"]);
    expect(new Set(occurrences.map((o) => o.diagramId))).toEqual(new Set(["D-01"]));
  });

  it("auto-numbers nothing when keys are given, and keeps given keys", () => {
    const state = exampleState();
    expect(state.objects.get("O-APP-1")!.key).toBe("APP-0001");
    expect(state.objects.get("O-APP-2")!.key).toBe("APP-0002");
  });

  it("applies the Target 2027 scenario's own edits on top of the baseline", () => {
    const state = exampleState();
    const change = exampleScenarioChange(state);
    const result = applyChange(state, change, context({ scenario: { id: TARGET_2027, isBaseline: false } }));
    expect(result).toMatchObject({ ok: true });
    expect(state.objects.get("O-APP-2")!.properties["lifecycle.status"]).toBe("retired");
    expect(state.objects.get("O-APP-4")!.name).toBe("Cloud CRM");
    expect(state.relationships.get("R-09")).toBeUndefined();
    expect(state.relationships.get("R-12")!.sourceId).toBe("O-APP-4");
  });

  it("undoes the whole example load exactly", () => {
    const state = new ModelState();
    const result = applyChange(state, exampleBaselineChange(), context());
    if (!result.ok) throw new Error("rejected");
    const undo = applyChange(
      state,
      { id: "UNDO", scenarioId: BASELINE, label: "Undo", edits: invertLog(result.log) },
      context(),
    );
    expect(undo).toMatchObject({ ok: true });
    expect(snapshot(state)).toEqual(snapshot(new ModelState()));
  });
});
