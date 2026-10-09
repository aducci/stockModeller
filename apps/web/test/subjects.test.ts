// What a diagram is about (DOC-1): its subject, the link from the element's documentation, and the diagram that
// every symbol of the element opens.
import { describe, expect, it } from "vitest";
import { essentials, insuranceGroup } from "@connectome/content";
import { applyChange, Metamodel, ModelState } from "@connectome/engine";
import type { Edit } from "@connectome/model";
import { newDocumentPlan } from "../src/document";
import { aboutEdits, canBeAbout, diagramsAbout, subjectDiagramFor, unlinkEdits } from "../src/subjects";
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

  it("opens a diagram about the element from its symbols elsewhere, never a document or the diagram itself", () => {
    const state = exampleState();
    expect(subjectDiagramFor(state, metamodel, "O-APP-1", "D-01")?.id).toBe("D-03");
    expect(subjectDiagramFor(state, metamodel, "O-APP-1", "D-03")).toBeUndefined();
    expect(subjectDiagramFor(state, metamodel, "O-APP-2", "D-01")).toBeUndefined();
  });

  it("makes a new document about its subject and links it from the subject's documentation, in one change", () => {
    const state = exampleState();
    const hld = metamodel.diagramType("hld")!.definition;
    const plan = newDocumentPlan(state, metamodel, hld, state.objects.get("O-APP-3")!, "D-NEW");
    run(state, plan.edits);
    expect(state.diagrams.get("D-NEW")!.definition).toEqual({ subject: "O-APP-3" });
    expect(state.objects.get("O-APP-3")!.properties["documentation.link"]).toEqual(["diagram:D-NEW"]);
  });

  it("adds to the links already there, and links a new canvas around an element", () => {
    const state = exampleState();
    const plan = diagramAroundPlan(
      state,
      metamodel,
      metamodel.diagramType("context")!,
      state.objects.get("O-APP-1")!,
      "D-C",
    );
    run(state, plan.edits);
    expect(state.objects.get("O-APP-1")!.properties["documentation.link"]).toEqual([
      "https://wiki.example.com/claims-manager",
      "diagram:D-04",
      "diagram:D-03",
      "diagram:D-C",
    ]);
  });

  it("does not link from a type that names no link property, nor twice", () => {
    const state = exampleState();
    expect(aboutEdits(state, metamodel, "applicationLandscape", "O-APP-1", "D-X").edits).toEqual([]);
    expect(aboutEdits(state, metamodel, "hld", "O-APP-1", "D-04").edits).toEqual([]);
  });

  it("takes a deleted diagram's links out of the elements' documentation", () => {
    const state = exampleState();
    run(state, [...unlinkEdits(state, metamodel, "D-04"), { edit: "deleteDiagram", id: "D-04" }]);
    expect(state.objects.get("O-APP-1")!.properties["documentation.link"]).toEqual([
      "https://wiki.example.com/claims-manager",
      "diagram:D-03",
    ]);
  });

  it("offers a type for elements its subject filter, or a document's template, accepts", () => {
    const state = exampleState();
    const hld = metamodel.diagramType("hld")!;
    expect(canBeAbout(metamodel, hld, state.objects.get("O-APP-1")!)).toBe(true);
    expect(canBeAbout(metamodel, hld, state.objects.get("O-CAP-1")!)).toBe(false);
    expect(canBeAbout(metamodel, metamodel.diagramType("context")!, state.objects.get("O-CAP-1")!)).toBe(true);
  });
});
