// What a diagram is about (DOC-1): its subject, the link from the element (a record of a kind since DOC-R2), and the
// diagram that every symbol of the element opens.
import { describe, expect, it } from "vitest";
import { essentials, insuranceGroup } from "@connectome/content";
import { applyChange, Metamodel, ModelState } from "@connectome/engine";
import type { Edit } from "@connectome/model";
import { newDocumentPlan } from "../src/document";
import { aboutEdits, canBeAbout, diagramsAbout, subjectDiagramFor } from "../src/subjects";
import { diagramAroundPlan } from "../src/views";

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

describe("diagram subjects", () => {
  it("lists the diagrams about an element, documents last", () => {
    const state = exampleState();
    expect(diagramsAbout(state, metamodel, "O-APP-1").map((d) => d.name)).toEqual([
      "Claims Manager context",
      "Claims Manager high-level design",
    ]);
  });

  it("opens a drill-down link or a diagram about the element from its symbols, never a document or itself", () => {
    const state = exampleState();
    expect(subjectDiagramFor(state, metamodel, "O-APP-1", "D-01")?.id).toBe("D-03");
    expect(subjectDiagramFor(state, metamodel, "O-APP-1", "D-03")).toBeUndefined();
    expect(subjectDiagramFor(state, metamodel, "O-APP-2", "D-01")).toBeUndefined();
    // A drill-down link wins over a diagram that is only about the element.
    run(state, [
      { edit: "createLink", id: "L-X", sourceId: "O-APP-2", kind: "drillDown", target: { diagramId: "D-08" } },
    ]);
    expect(subjectDiagramFor(state, metamodel, "O-APP-2", "D-01")?.id).toBe("D-08");
  });

  it("makes a new document about its subject and links it from the subject as a document, in one change", () => {
    const state = exampleState();
    const hld = metamodel.diagramType("hld")!.definition;
    const plan = newDocumentPlan(state, metamodel, hld, state.objects.get("O-APP-3")!, "D-NEW");
    run(state, plan.edits);
    expect(state.diagrams.get("D-NEW")!.definition).toEqual({ subject: "O-APP-3" });
    expect(state.links.find("bySource", "O-APP-3").map((l) => [l.kind, l.target])).toEqual([
      ["document", { diagramId: "D-NEW" }],
    ]);
  });

  it("adds to the links already there, and links a new canvas around an element as a drill-down", () => {
    const state = exampleState();
    const plan = diagramAroundPlan(
      state,
      metamodel,
      metamodel.diagramType("context")!,
      state.objects.get("O-APP-1")!,
      "D-C",
    );
    run(state, plan.edits);
    expect(state.links.find("bySource", "O-APP-1").map((l) => l.kind)).toEqual([
      "web",
      "document",
      "drillDown",
      "related",
      "drillDown",
    ]);
    expect(state.links.find("byDiagram", "D-C").map((l) => l.sourceId)).toEqual(["O-APP-1"]);
  });

  it("does not link from a type that names no link kind, nor twice", () => {
    const state = exampleState();
    expect(aboutEdits(state, metamodel, "applicationLandscape", "O-APP-1", "D-X").edits).toEqual([]);
    expect(aboutEdits(state, metamodel, "hld", "O-APP-1", "D-04").edits).toEqual([]);
  });

  it("loses the links to a deleted diagram", () => {
    const state = exampleState();
    run(state, [{ edit: "deleteDiagram", id: "D-04" }]);
    expect(state.links.find("bySource", "O-APP-1").map((l) => l.id)).toEqual(["L-01", "L-03", "L-04"]);
  });

  it("offers a type for elements its subject filter, or a document's template, accepts", () => {
    const state = exampleState();
    const hld = metamodel.diagramType("hld")!;
    expect(canBeAbout(metamodel, hld, state.objects.get("O-APP-1")!)).toBe(true);
    expect(canBeAbout(metamodel, hld, state.objects.get("O-CAP-1")!)).toBe(false);
    expect(canBeAbout(metamodel, metamodel.diagramType("context")!, state.objects.get("O-CAP-1")!)).toBe(true);
  });
});
