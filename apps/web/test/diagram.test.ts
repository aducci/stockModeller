import { describe, expect, it } from "vitest";
import { essentials, insuranceGroup } from "@connectome/content";
import { applyChange, Metamodel, ModelState } from "@connectome/engine";
import {
  connectChoices,
  defaultFolderFor,
  deletionImpact,
  edgePoint,
  layoutBoxes,
  paletteTypes,
  snap,
  symbolFor,
} from "../src/diagram";

const metamodel = Metamodel.compile(essentials.metamodel, essentials.diagramTypes);

function exampleState(): ModelState {
  const state = new ModelState();
  const result = applyChange(state, insuranceGroup.baselineChange(), {
    metamodel,
    actor: { kind: "user", id: "U-DANA" },
    scenario: { id: insuranceGroup.baselineScenarioId, isBaseline: true },
    now: "2026-10-06T12:00:00.000Z",
  });
  if (!result.ok) throw new Error(JSON.stringify(result.reasons));
  return state;
}

const state = exampleState();
const diagram = state.diagrams.get("D-01")!;

describe("diagram editor helpers", () => {
  it("snaps to the 8 px grid", () => {
    expect([snap(0), snap(3), snap(4), snap(13), snap(-5)]).toEqual([0, 0, 8, 16, -8]);
  });

  it("places nested occurrences relative to their parent, and moves children with a dragged parent", () => {
    expect(layoutBoxes(state, diagram.id).get("OO-2")).toEqual({ x: 36, y: 56, w: 230, h: 160 });
    const dragged = layoutBoxes(state, diagram.id, { id: "OO-1", dx: 10, dy: 20 });
    expect(dragged.get("OO-1")).toMatchObject({ x: 30, y: 40 });
    expect(dragged.get("OO-2")).toMatchObject({ x: 46, y: 76 });
    expect(dragged.get("OO-4")).toMatchObject({ x: 60, y: 110 });
  });

  it("ends a line on the edge of a box", () => {
    const box = { x: 0, y: 0, w: 100, h: 40 };
    expect(edgePoint(box, { x: 200, y: 20 })).toEqual({ x: 100, y: 20 });
    expect(edgePoint(box, { x: 50, y: -100 })).toEqual({ x: 50, y: 0 });
    expect(edgePoint(box, { x: 50, y: 20 })).toEqual({ x: 50, y: 20 });
  });

  it("sizes symbols from the object type, then the diagram type, then the occurrence", () => {
    expect(symbolFor(metamodel, diagram, "capability")).toMatchObject({ width: 160, height: 60, fill: "#f6efe2" });
    expect(symbolFor(metamodel, diagram, "application")).toMatchObject({ width: 130, height: 48 });
    expect(symbolFor(metamodel, diagram, "application", { fill: "#000000" }).fill).toBe("#000000");
  });

  it("offers the object types the diagram type shows, without abstract ones", () => {
    expect(paletteTypes(metamodel, diagram).map((t) => t.definition.key)).toEqual([
      "capability",
      "application",
      "saasApplication",
      "interface",
    ]);
  });

  it("puts a new object in its type's default folder, or else in the diagram's folder (B19)", () => {
    expect(defaultFolderFor(state, metamodel, "capability", diagram)).toBe("F02");
    expect(defaultFolderFor(state, metamodel, "application", diagram)).toBe("F04");
    // Technology/Servers does not exist in the example repository.
    expect(defaultFolderFor(state, metamodel, "server", diagram)).toBe(diagram.folderId);
  });

  it("offers existing relationships first, then the allowed types the diagram shows, most used first", () => {
    const choices = connectChoices(state, metamodel, diagram, "O-APP-1", "O-APP-3");
    expect(choices.map((c) => [c.type.key, c.existingId ?? null])).toEqual([
      ["flowsTo", "R-08"],
      ["flowsTo", null], // three flows and three messages in the example, against four containments
      ["contains", null],
    ]);
    // An application realises a capability; `serves` (to a process) is not offered.
    expect(connectChoices(state, metamodel, diagram, "O-APP-2", "O-CAP-1").map((c) => c.type.key)).toEqual([
      "realizes",
    ]);
    expect(connectChoices(state, metamodel, diagram, "O-CAP-1", "O-APP-1")).toEqual([]);
  });

  it("lists what deleting an object takes with it", () => {
    const impact = deletionImpact(state, metamodel, "O-CAP-1", null);
    expect(impact.relationships.map((r) => r.id).sort()).toEqual(["R-01", "R-02"]);
    expect(impact.children.sort()).toEqual(["O-CAP-2", "O-CAP-3"]);
    expect(impact.diagrams.map((d) => d.id)).toEqual(["D-01"]);
    expect(deletionImpact(state, metamodel, "O-CAP-1", "D-01").diagrams).toEqual([]);
  });
});
