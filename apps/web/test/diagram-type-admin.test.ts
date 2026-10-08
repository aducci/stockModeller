// Diagram types admin (views in the app, slice U-3): duplicating, editing on the draft, kind changes, and what a
// draft does to the diagrams already drawn.
import { describe, expect, it } from "vitest";
import { essentials, insuranceGroup } from "@connectome/content";
import { applyChange, Metamodel, ModelState } from "@connectome/engine";
import {
  diagramTypeChanges,
  duplicateDiagramType,
  newDiagramTypeKey,
  offTypeOccurrences,
  removeDiagramType,
  setKind,
  setSymbol,
  updateDiagramType,
} from "../src/diagram-type-admin";
import { compileDraft, type Draft } from "../src/property-admin";

const published: Draft = { package: essentials.metamodel, diagramTypes: essentials.diagramTypes };
const type = (draft: Draft, key: string) => draft.diagramTypes.find((t) => t.key === key)!;

describe("diagram types on the draft", () => {
  it("duplicates a type under a new name and key, right after it, and the copy compiles", () => {
    const { draft, key } = duplicateDiagramType(published, "hld");
    expect(key).toBe("highLevelDesignCopy");
    const keys = draft.diagramTypes.map((t) => t.key);
    expect(keys[keys.indexOf("hld") + 1]).toBe(key);
    expect(type(draft, key)).toMatchObject({ name: "High-level design copy", kind: "document" });
    expect(type(draft, key).document).toEqual(type(published, "hld").document);
    expect(compileDraft(draft).problems).toEqual([]);
    // A second copy gets the next name, and keys never clash.
    const again = duplicateDiagramType(draft, "hld");
    expect(type(again.draft, again.key).name).toBe("High-level design copy 2");
    expect(newDiagramTypeKey("High-level design copy", ["highLevelDesignCopy"])).toBe("highLevelDesignCopy2");
  });

  it("edits fields, clears emptied ones, and keeps an empty relationship list (which allows none)", () => {
    let draft = updateDiagramType(published, "context", { description: undefined, relationshipTypes: [] });
    expect("description" in type(draft, "context")).toBe(false);
    expect(type(draft, "context").relationshipTypes).toEqual([]);
    draft = setSymbol(draft, "context", "interface", "fill", "#ff0000");
    expect(type(draft, "context").symbols!.interface).toMatchObject({ shape: "ellipse", fill: "#ff0000" });
    draft = setSymbol(draft, "sequence", "application", "shape", "hexagon");
    draft = setSymbol(draft, "sequence", "application", "shape", undefined);
    expect(type(draft, "sequence").symbols).toBeUndefined();
  });

  it("changes kind with the new kind's settings, and counts what changed", () => {
    const { draft: copied, key } = duplicateDiagramType(published, "context", "Data access");
    const draft = setKind(copied, key, "matrix");
    expect(type(draft, key).matrix).toEqual({
      rows: { from: { type: ["applicationBase"] } },
      columns: { from: { type: ["interface"] } },
      relationships: { types: ["flowsTo"] },
    });
    expect(compileDraft(draft).problems).toEqual([]);
    const renamed = updateDiagramType(draft, "sequence", { name: "UML sequence" });
    const changes = diagramTypeChanges(published, removeDiagramType(renamed, "capabilityMatrix"));
    expect(changes.added.map((t) => t.key)).toEqual([key]);
    expect(changes.changed.map((t) => t.key)).toEqual(["sequence"]);
    expect(changes.removed.map((t) => t.key)).toEqual(["capabilityMatrix"]);
    // Carried properties count with the properties, not as a changed type.
    const carried = updateDiagramType(published, "context", { properties: ["documentation.link"] });
    expect(diagramTypeChanges(published, carried).changed).toEqual([]);
  });

  it("lists what diagrams show that their type no longer allows", () => {
    const metamodel = Metamodel.compile(essentials.metamodel, essentials.diagramTypes);
    const state = new ModelState();
    applyChange(state, insuranceGroup.baselineChange(), {
      metamodel,
      actor: { kind: "user", id: "U-DANA" },
      scenario: { id: insuranceGroup.baselineScenarioId, isBaseline: true },
      now: "2026-10-08T12:00:00.000Z",
    });
    expect(offTypeOccurrences(state, metamodel)).toEqual([]);
    const draft = updateDiagramType(published, "context", {
      objectTypes: ["applicationBase", "interface"],
      relationshipTypes: ["calls", "flowsTo"],
    });
    const after = compileDraft(draft).metamodel!;
    expect(offTypeOccurrences(state, after)).toEqual([
      { diagramType: "context", type: "dataObject", what: "object", count: 1 },
      { diagramType: "context", type: "accesses", what: "relationship", count: 1 },
    ]);
  });
});
